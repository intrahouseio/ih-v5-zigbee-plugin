import winston from 'winston';
declare type Z2MLogLevel = 'warn' | 'debug' | 'info' | 'error';
declare function cleanup(): void;
declare function logOutput(): void;
declare function addTransport(transport: winston.transport): void;
declare function getLevel(): Z2MLogLevel;
declare function setLevel(level: Z2MLogLevel): void;
declare function warn(message: string): void;
declare function warning(message: string): void;
declare function info(message: string): void;
declare function debug(message: string): void;
declare function error(message: string): void;
declare const _default: {
    logOutput: typeof logOutput;
    warn: typeof warn;
    warning: typeof warning;
    error: typeof error;
    info: typeof info;
    debug: typeof debug;
    setLevel: typeof setLevel;
    getLevel: typeof getLevel;
    cleanup: typeof cleanup;
    addTransport: typeof addTransport;
    winston: winston.Logger;
};
export default _default;
//# sourceMappingURL=logger.d.ts.map