"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const debug_1 = __importDefault(require("debug"));
const bonjour_service_1 = __importDefault(require("bonjour-service"));
const debug = (0, debug_1.default)("zigbee-herdsman:adapter");
class Adapter extends events_1.default.EventEmitter {
    constructor(networkOptions, serialPortOptions, backupPath, adapterOptions, logger) {
        super();
        this.greenPowerGroup = 0x0b84;
        this.networkOptions = networkOptions;
        this.adapterOptions = adapterOptions;
        this.serialPortOptions = serialPortOptions;
        this.backupPath = backupPath;
        this.logger = logger;
    }
    /**
     * Utility
     */
    static async create(networkOptions, serialPortOptions, backupPath, adapterOptions, logger) {
        const { ZStackAdapter } = await Promise.resolve().then(() => __importStar(require('./z-stack/adapter')));
        const { DeconzAdapter } = await Promise.resolve().then(() => __importStar(require('./deconz/adapter')));
        const { ZiGateAdapter } = await Promise.resolve().then(() => __importStar(require('./zigate/adapter')));
        const { EZSPAdapter } = await Promise.resolve().then(() => __importStar(require('./ezsp/adapter')));
        let adapters;
        const adapterLookup = { zstack: ZStackAdapter, deconz: DeconzAdapter, zigate: ZiGateAdapter,
            ezsp: EZSPAdapter };
        if (serialPortOptions.adapter && serialPortOptions.adapter !== 'auto') {
            if (adapterLookup.hasOwnProperty(serialPortOptions.adapter)) {
                adapters = [adapterLookup[serialPortOptions.adapter]];
            }
            else {
                throw new Error(`Adapter '${serialPortOptions.adapter}' does not exists, possible ` +
                    `options: ${Object.keys(adapterLookup).join(', ')}`);
            }
        }
        else {
            adapters = Object.values(adapterLookup);
        }
        // Use ZStackAdapter by default
        let adapter = adapters[0];
        if (!serialPortOptions.path) {
            debug('No path provided, auto detecting path');
            for (const candidate of adapters) {
                const path = await candidate.autoDetectPath();
                if (path) {
                    debug(`Auto detected path '${path}' from adapter '${candidate.name}'`);
                    serialPortOptions.path = path;
                    adapter = candidate;
                    break;
                }
            }
            if (!serialPortOptions.path) {
                throw new Error("No path provided and failed to auto detect path");
            }
        }
        else if (serialPortOptions.path.startsWith("mdns://")) {
            const mdnsDevice = serialPortOptions.path.substring(7);
            if (mdnsDevice.length == 0) {
                throw new Error(`No mdns device specified. ` +
                    `You must specify the coordinator mdns service type after mdns://, e.g. mdns://my-adapter`);
            }
            const bj = new bonjour_service_1.default();
            const mdnsTimeout = 2000; // timeout for mdns scan
            logger.info(`Starting mdns discovery for coordinator: ${mdnsDevice}`);
            await new Promise((resolve, reject) => {
                bj.findOne({ type: mdnsDevice }, mdnsTimeout, function (service) {
                    var _a, _b, _c, _d, _e;
                    if (service) {
                        if (((_a = service.txt) === null || _a === void 0 ? void 0 : _a.radio_type) && ((_b = service.txt) === null || _b === void 0 ? void 0 : _b.baud_rate) && service.addresses && service.port) {
                            const mdnsIp = service.addresses[0];
                            const mdnsPort = service.port;
                            const mdnsAdapter = (service.txt.radio_type == 'znp' ?
                                'zstack' : service.txt.radio_type);
                            const mdnsBaud = parseInt(service.txt.baud_rate);
                            logger.info(`Coordinator Ip: ${mdnsIp}`);
                            logger.info(`Coordinator Port: ${mdnsPort}`);
                            logger.info(`Coordinator Radio: ${mdnsAdapter}`);
                            logger.info(`Coordinator Baud: ${mdnsBaud}\n`);
                            bj.destroy();
                            serialPortOptions.path = `tcp://${mdnsIp}:${mdnsPort}`;
                            serialPortOptions.adapter = mdnsAdapter;
                            serialPortOptions.baudRate = mdnsBaud;
                            if (adapterLookup.hasOwnProperty(serialPortOptions.adapter)
                                && serialPortOptions.adapter !== 'auto') {
                                adapter = adapterLookup[serialPortOptions.adapter];
                                resolve(new adapter(networkOptions, serialPortOptions, backupPath, adapterOptions, logger));
                            }
                            else {
                                reject(new Error(`Adapter ${serialPortOptions.adapter} is not supported.`));
                            }
                        }
                        else {
                            bj.destroy();
                            reject(new Error(`Coordinator returned wrong Zeroconf format! The following values are expected:\n` +
                                `txt.radio_type, got: ${(_c = service.txt) === null || _c === void 0 ? void 0 : _c.radio_type}\n` +
                                `txt.baud_rate, got: ${(_d = service.txt) === null || _d === void 0 ? void 0 : _d.baud_rate}\n` +
                                `address, got: ${(_e = service.addresses) === null || _e === void 0 ? void 0 : _e[0]}\n` +
                                `port, got: ${service.port}`));
                        }
                    }
                    else {
                        bj.destroy();
                        reject(new Error(`Coordinator [${mdnsDevice}] not found after timeout of ${mdnsTimeout}ms!`));
                    }
                });
            });
        }
        else {
            try {
                // Determine adapter to use
                for (const candidate of adapters) {
                    if (await candidate.isValidPath(serialPortOptions.path)) {
                        debug(`Path '${serialPortOptions.path}' is valid for '${candidate.name}'`);
                        adapter = candidate;
                        break;
                    }
                }
            }
            catch (error) {
                debug(`Failed to validate path: '${error}'`);
            }
        }
        return new adapter(networkOptions, serialPortOptions, backupPath, adapterOptions, logger);
    }
}
exports.default = Adapter;
//# sourceMappingURL=adapter.js.map