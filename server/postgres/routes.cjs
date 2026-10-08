const { Worker } = require("node:worker_threads");
const path = require("node:path");
// Each worker handles one operation at a time, including asynchronous SUNAT calls.
// Synchronous desktop database calls execute outside the HTTP event loop.
class RoutePool {
  constructor(size = 3) {
    this.queue = [];
    this.next = 0;
    this.slots = Array.from({ length: size }, () => this.slot());
  }
  slot() {
    const slot = {
      worker: new Worker(path.join(__dirname, "route-worker.cjs")),
      job: null,
    };
    slot.worker.on("message", (m) => {
      if (!slot.job || m.id !== slot.job.id) return;
      const j = slot.job;
      slot.job = null;
      if (m.error) {
        const e = Error(m.error.message);
        e.code = m.error.code;
        j.reject(e);
      } else j.resolve(m.result);
      this.drain();
    });
    slot.worker.on("error", () => {
      if (slot.job) {
        slot.job.reject(Error("El proceso contable se interrumpió."));
        slot.job = null;
      }
    });
    slot.worker.on("exit", () => {
      if (slot.job) {
        slot.job.reject(Error("El proceso contable se cerró."));
        slot.job = null;
      }
      if (!this.closing) {
        const index = this.slots.indexOf(slot);
        if (index >= 0) this.slots[index] = this.slot();
        this.drain();
      }
    });
    return slot;
  }
  run(context, channel, args) {
    if (this.queue.length > 100)
      return Promise.reject(Error("Servidor ocupado. Inténtalo nuevamente."));
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: ++this.next,
        context,
        channel,
        args,
        resolve,
        reject,
      });
      this.drain();
    });
  }
  drain() {
    for (const slot of this.slots) {
      if (slot.job || !this.queue.length) continue;
      slot.job = this.queue.shift();
      const { id, context, channel, args } = slot.job;
      slot.worker.postMessage({ id, context, channel, args });
    }
  }
  async close() {
    this.closing = true;
    for (const job of this.queue.splice(0))
      job.reject(Error("El servidor se cerró."));
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }
}
module.exports = { RoutePool };
