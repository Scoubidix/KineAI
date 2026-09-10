"""Places limitées et file à priorité : une requête interactive passe toujours devant une batch,
et les batch n'occupent jamais plus de `batch_max_slots` places (défaut : toutes sauf une), pour
qu'une dictée trouve une place libre même quand des transcriptions de séance tournent."""
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
    def __init__(self, slots: int, interactive_wait_max: float = 30.0, batch_queue_max: int = 20, batch_max_slots: int | None = None):
        self.slots = slots
        self.free = slots
        self.interactive_wait_max = interactive_wait_max
        self.batch_queue_max = batch_queue_max
        # Au moins une place batch (sinon la séance ne tournerait jamais), au plus toutes les places
        self.batch_max_slots = max(1, slots - 1) if batch_max_slots is None else max(1, min(batch_max_slots, slots))
        self.busy_batch = 0
        self._heap: list = []
        self._counter = itertools.count()

    @property
    def busy(self) -> int:
        return self.slots - self.free

    @property
    def queued(self) -> int:
        return len(self._heap)

    def _can_run(self, rank: int) -> bool:
        return rank == 0 or self.busy_batch < self.batch_max_slots

    def _take(self, rank: int) -> None:
        self.free -= 1
        if rank == 1:
            self.busy_batch += 1

    async def acquire(self, priority: str) -> float:
        """Prend une place ; renvoie le temps d'attente en secondes. Lève Busy si refusé."""
        rank = PRIORITY_RANK[priority]
        if rank == 1 and self.queued >= self.batch_queue_max:
            raise Busy(10)
        if self.free > 0 and not self._heap and self._can_run(rank):
            self._take(rank)
            return 0.0
        fut = asyncio.get_running_loop().create_future()
        heapq.heappush(self._heap, (rank, next(self._counter), fut))
        # Une place libre peut déjà convenir (ex. une batch en tête au plafond, et nous sommes interactive)
        self._dispatch()
        if fut.done():
            return 0.0
        t0 = time.monotonic()
        timeout = self.interactive_wait_max if rank == 0 else None
        try:
            await asyncio.wait_for(asyncio.shield(fut), timeout)
        except asyncio.TimeoutError:
            self._discard(fut, priority)
            raise Busy(5)
        except asyncio.CancelledError:
            # L'appelant a annulé son attente (ex. requête abandonnée) : ne pas garder
            # la place au chaud pour un futur que plus personne n'écoute.
            self._discard(fut, priority)
            raise
        return time.monotonic() - t0

    def _discard(self, fut, priority: str) -> None:
        """Retire fut de la file ; si une place lui avait déjà été transmise, on la rend."""
        self._heap = [e for e in self._heap if e[2] is not fut]
        heapq.heapify(self._heap)
        if fut.done():          # place attribuée juste avant l'expiration/l'annulation : on la rend
            self.release(priority)

    def release(self, priority: str = "interactive") -> None:
        """Rend une place, puis sert les attentes éligibles."""
        self.free += 1
        if PRIORITY_RANK[priority] == 1:
            self.busy_batch -= 1
        self._dispatch()

    def _dispatch(self) -> None:
        """Attribue les places libres, par priorité puis ordre d'arrivée, en respectant le plafond batch."""
        while self.free > 0 and self._heap:
            rank, _, fut = self._heap[0]
            if fut.done():
                heapq.heappop(self._heap)
                continue
            if not self._can_run(rank):
                break   # tête batch au plafond ; aucune interactive derrière (elles sont triées avant)
            heapq.heappop(self._heap)
            self._take(rank)
            fut.set_result(None)
