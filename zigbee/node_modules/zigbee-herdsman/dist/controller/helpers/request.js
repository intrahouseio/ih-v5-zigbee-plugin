"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable-next-line @typescript-eslint/no-explicit-any*/
class Request {
    constructor(func, frame, timeout, sendWhen, sendPolicy, lastError, resolve, reject) {
        this._func = func;
        this.frame = frame;
        this.sendWhen = sendWhen !== null && sendWhen !== void 0 ? sendWhen : 'active',
            this.expires = timeout + Date.now();
        this.sendPolicy = sendPolicy !== null && sendPolicy !== void 0 ? sendPolicy : (typeof frame.getCommand !== 'function' ?
            undefined : Request.defaultSendPolicy[frame.getCommand().ID]);
        this._resolveQueue = resolve === undefined ?
            new Array() : new Array(resolve);
        this._rejectQueue = reject === undefined ?
            new Array() : new Array(reject);
        this._lastError = lastError !== null && lastError !== void 0 ? lastError : Error("Request rejected before first send");
    }
    moveCallbacks(from) {
        this._resolveQueue = this._resolveQueue.concat(from._resolveQueue);
        this._rejectQueue = this._rejectQueue.concat(from._rejectQueue);
        from._resolveQueue.length = 0;
        from._rejectQueue.length = 0;
    }
    addCallbacks(resolve, reject) {
        this._resolveQueue.push(resolve);
        this._rejectQueue.push(reject);
    }
    reject(error) {
        this._rejectQueue.forEach(el => el(error !== null && error !== void 0 ? error : this._lastError));
        this._rejectQueue.length = 0;
    }
    resolve(value) {
        this._resolveQueue.forEach(el => el(value));
        this._resolveQueue.length = 0;
    }
    async send() {
        try {
            return await this._func(this.frame);
        }
        catch (error) {
            this._lastError = error;
            throw (error);
        }
    }
}
Request.defaultSendPolicy = {
    0x00: 'keep-payload',
    0x01: 'immediate',
    0x02: 'keep-command',
    0x03: 'keep-cmd-undiv',
    0x04: 'immediate',
    0x05: 'keep-command',
    0x06: 'keep-payload',
    0x07: 'immediate',
    0x08: 'keep-payload',
    0x09: 'immediate',
    0x0a: 'keep-payload',
    0x0b: 'immediate',
    0x0c: 'keep-payload',
    0x0d: 'immediate',
    0x0e: 'keep-payload',
    0x0f: 'keep-payload',
    0x10: 'immediate',
    0x11: 'keep-payload',
    0x12: 'immediate',
    0x13: 'keep-payload',
    0x14: 'immediate',
    0x15: 'keep-payload',
    0x16: 'immediate', // Discover Attributes Extended Response
};
exports.default = Request;
//# sourceMappingURL=request.js.map