"""Places limitées et file à priorité : une requête interactive passe toujours devant une batch."""
import asyncio
import heapq
import itertools
import time

PRIORITY_RANK = {"interactive": 0, "batch": 1}


class Busy(Exception):
    def __init__(self, retry_after: int = 5):
        super().__init__("busy")
        self.retry_after = retry_after


class Scheduler:
    def __init__(self, slots: int, interactive_wait_max: float = 30.0, batch_queue_max: int = 20):
        self.slots = slots
        self.free = slots
        self.interactive_wait_max = interactive_wait_max
        self.batch_queue_max = batch_queue_max
        self._heap: list = []
        self._counter = itertools.count()

    @property
    def busy(self) -> int:
        return self.slots - self.free

    @property
    def queued(self) -> int:
        return len(self._heap)

    async def acquire(self, priority: str) -> float:
        """Prend une place ; renvoie le temps d'attente en secondes. Lève Busy si refusé."""
        rank = PRIORITY_RANK[priority]
        if rank == 1 and self.queued >= self.batch_queue_max:
            raise Busy(10)
        if self.free > 0 and not self._heap:
            self.free -= 1
            return 0.0
        fut = asyncio.get_running_loop().create_future()
        heapq.heappush(self._heap, (rank, next(self._counter), fut))
        t0 = time.monotonic()
        timeout = self.interactive_wait_max if rank == 0 else None
        try:
            await asyncio.wait_for(asyncio.shield(fut), timeout)
        except asyncio.TimeoutError:
            self._discard(fut)
            raise Busy(5)
        except asyncio.CancelledError:
            # L'appelant a annulé son attente (ex. requête abandonnée) : ne pas garder
            # la place au chaud pour un futur que plus personne n'écoute.
            self._discard(fut)
            raise
        return time.monotonic() - t0

    def _discard(self, fut) -> None:
        """Retire fut de la file ; si une place lui avait déjà été transmise, on la rend."""
        self._heap = [e for e in self._heap if e[2] is not fut]
        heapq.heapify(self._heap)
        if fut.done():          # place attribuée juste avant l'expiration/l'annulation : on la rend
            self.release()

    def release(self) -> None:
        """Rend une place : transmise directement à la tête de file, sinon libérée."""
        while self._heap:
            _, _, fut = heapq.heappop(self._heap)
            if not fut.done():
                fut.set_result(None)
                return
        self.free += 1
