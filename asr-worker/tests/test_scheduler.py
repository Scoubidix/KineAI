import asyncio
import pytest
from scheduler import Scheduler, Busy


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_free_slot_is_immediate():
    async def main():
        s = Scheduler(slots=2)
        assert await s.acquire("interactive") == 0.0
        assert s.busy == 1 and s.queued == 0
        s.release()
        assert s.busy == 0
    run(main())


def test_interactive_goes_before_batch():
    async def main():
        s = Scheduler(slots=1)
        await s.acquire("batch")               # occupe la place
        order = []

        async def waiter(priority):
            await s.acquire(priority)
            order.append(priority)
            await asyncio.sleep(0.01)
            s.release(priority)

        t1 = asyncio.create_task(waiter("batch"))
        await asyncio.sleep(0.01)              # batch en file d'abord
        t2 = asyncio.create_task(waiter("interactive"))
        await asyncio.sleep(0.01)
        assert s.queued == 2
        s.release("batch")                     # libère la place initiale
        await asyncio.gather(t1, t2)
        assert order == ["interactive", "batch"]
    run(main())


def test_interactive_times_out_with_busy():
    async def main():
        s = Scheduler(slots=1, interactive_wait_max=0.05)
        await s.acquire("interactive")
        with pytest.raises(Busy) as e:
            await s.acquire("interactive")
        assert e.value.retry_after == 5
        assert s.queued == 0                   # retiré de la file
    run(main())


def test_batch_refused_when_queue_full():
    async def main():
        s = Scheduler(slots=1, batch_queue_max=1)
        await s.acquire("batch")
        t = asyncio.create_task(s.acquire("batch"))   # 1 en file
        await asyncio.sleep(0.01)
        with pytest.raises(Busy):
            await s.acquire("batch")
        s.release("batch")
        await t
    run(main())


def test_cancelled_waiter_does_not_leak_slot():
    async def main():
        s = Scheduler(slots=1)
        await s.acquire("interactive")           # occupe l'unique place
        t = asyncio.create_task(s.acquire("interactive"))
        await asyncio.sleep(0.01)                 # entre en file d'attente
        assert s.queued == 1
        t.cancel()
        with pytest.raises(asyncio.CancelledError):
            await t
        assert s.queued == 0                      # retiré de la file, pas de futur fantôme
        s.release()                                # rend la place initiale
        assert s.free == 1                         # personne ne l'a récupérée
    run(main())


def test_one_slot_stays_reserved_for_interactive():
    async def main():
        s = Scheduler(slots=2)                 # batch_max_slots = 1 par défaut
        await s.acquire("batch")
        t = asyncio.create_task(s.acquire("batch"))
        await asyncio.sleep(0.01)
        assert s.queued == 1 and s.free == 1   # la seconde batch attend malgré une place libre
        assert await s.acquire("interactive") == 0.0   # la dictée prend la place réservée
        s.release("interactive")
        await asyncio.sleep(0.01)
        assert s.queued == 1 and s.free == 1   # toujours réservée : la batch reste en file
        s.release("batch")
        await t                                # la première batch finie, la seconde démarre
        assert s.busy_batch == 1 and s.queued == 0
    run(main())
