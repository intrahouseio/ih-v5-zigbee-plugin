"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Queue {
    constructor(concurrent = 1) {
        this.jobs = [];
        this.concurrent = concurrent;
    }
    execute(func, key = null) {
        return new Promise((resolve, reject) => {
            this.jobs.push({ key, func, running: false, resolve, reject });
            this.executeNext();
        });
    }
    async executeNext() {
        const job = this.getNext();
        if (job) {
            job.running = true;
            try {
                const result = await job.func();
                this.jobs.splice(this.jobs.indexOf(job), 1);
                job.resolve(result);
                this.executeNext();
            }
            catch (error) {
                this.jobs.splice(this.jobs.indexOf(job), 1);
                job.reject(error);
                this.executeNext();
            }
        }
    }
    getNext() {
        if (this.jobs.filter((j) => j.running).length > (this.concurrent - 1)) {
            return null;
        }
        for (let i = 0; i < this.jobs.length; i++) {
            const job = this.jobs[i];
            if (!job.running && (!job.key || !this.jobs.find((j) => j.key === job.key && j.running))) {
                return job;
            }
        }
        return null;
    }
    clear() {
        this.jobs = [];
    }
    count() {
        return this.jobs.length;
    }
}
exports.default = Queue;
//# sourceMappingURL=queue.js.map