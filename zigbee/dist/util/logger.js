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
const winston_1 = __importDefault(require("winston"));
const moment_1 = __importDefault(require("moment"));
const settings = __importStar(require("./settings"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const mkdir_recursive_1 = __importDefault(require("mkdir-recursive"));
const rimraf_1 = require("rimraf");
const assert_1 = __importDefault(require("assert"));
const colorizer = winston_1.default.format.colorize();
const z2mToWinstonLevel = (level) => level === 'warn' ? 'warning' : level;
const winstonToZ2mLevel = (level) => level === 'warning' ? 'warn' : level;
const levelWithCompensatedLength = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};
let logger;
let fileTransport;
let output;
let directory;
let logFilename;
let transportsToUse;
function init() {
    // What transports to enable
    output = settings.get().advanced.log_output;
    // Directory to log to
    const timestamp = (0, moment_1.default)(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
    directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
    logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);
    // Make sure that log directory exists when not logging to stdout only
    if (output.includes('file')) {
        mkdir_recursive_1.default.mkdirSync(directory);
        if (settings.get().advanced.log_symlink_current) {
            const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
            const actual = './' + timestamp;
            /* istanbul ignore next */
            if (fs_1.default.existsSync(current)) {
                fs_1.default.unlinkSync(current);
            }
            fs_1.default.symlinkSync(actual, current);
        }
    }
    // Determine the log level.
    const z2mLevel = settings.get().advanced.log_level;
    const validLevels = ['info', 'error', 'warn', 'debug'];
    (0, assert_1.default)(validLevels.includes(z2mLevel), `'${z2mLevel}' is not valid log_level, use one of '${validLevels.join(', ')}'`);
    const level = z2mToWinstonLevel(z2mLevel);
    const timestampFormat = () => (0, moment_1.default)().format(settings.get().advanced.timestamp_format);
    // Setup default console logger
    transportsToUse = [
        new winston_1.default.transports.Console({
            level,
            silent: !output.includes('console'),
            format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: timestampFormat }), winston_1.default.format.printf(/* istanbul ignore next */ (info) => {
                const { timestamp, level, message } = info;
                const l = winstonToZ2mLevel(level);
                const plainPrefix = `Zigbee2MQTT:${levelWithCompensatedLength[l]}`;
                let prefix = plainPrefix;
                if (process.stdout.isTTY) {
                    prefix = colorizer.colorize(l, plainPrefix);
                }
                return `${prefix} ${timestamp.split('.')[0]}: ${message}`;
            })),
        }),
    ];
    // Add file logger when enabled
    // NOTE: the initiation of the logger, even when not added as transport tries to create the logging directory
    const transportFileOptions = {
        filename: path_1.default.join(directory, logFilename),
        json: false,
        level,
        format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: timestampFormat }), winston_1.default.format.printf(/* istanbul ignore next */ (info) => {
            const { timestamp, level, message } = info;
            const l = winstonToZ2mLevel(level);
            return `${levelWithCompensatedLength[l]} ${timestamp.split('.')[0]}: ${message}`;
        })),
    };
    if (settings.get().advanced.log_rotation) {
        transportFileOptions.tailable = true;
        transportFileOptions.maxFiles = 3; // Keep last 3 files
        transportFileOptions.maxsize = 10000000; // 10MB
    }
    if (output.includes('file')) {
        fileTransport = new winston_1.default.transports.File(transportFileOptions);
        transportsToUse.push(fileTransport);
    }
    /* istanbul ignore next */
    if (output.includes('syslog')) {
        // eslint-disable-next-line
        require('winston-syslog').Syslog;
        const options = {
            app_name: 'Zigbee2MQTT',
            format: winston_1.default.format.printf(/* istanbul ignore next */ (info) => {
                return `${info.message}`;
            }),
            ...settings.get().advanced.log_syslog,
        };
        if (options.hasOwnProperty('type'))
            options.type = options.type.toString();
        // @ts-ignore
        transportsToUse.push(new winston_1.default.transports.Syslog(options));
    }
    logger = winston_1.default.createLogger({ transports: transportsToUse, levels: winston_1.default.config.syslog.levels });
}
// Cleanup any old log directory.
function cleanup() {
    if (settings.get().advanced.log_directory.includes('%TIMESTAMP%')) {
        const rootDirectory = path_1.default.join(directory, '..');
        let directories = fs_1.default.readdirSync(rootDirectory).map((d) => {
            d = path_1.default.join(rootDirectory, d);
            return { path: d, birth: fs_1.default.statSync(d).mtime };
        });
        directories.sort((a, b) => b.birth - a.birth);
        directories = directories.slice(10, directories.length);
        directories.forEach((dir) => {
            logger.debug(`Removing old log directory '${dir.path}'`);
            (0, rimraf_1.rimrafSync)(dir.path);
        });
    }
}
// Print to user what logging is enabled
function logOutput() {
    if (output.includes('file')) {
        if (output.includes('console')) {
            logger.info(`Logging to console and directory: '${directory}' filename: ${logFilename}`);
        }
        else {
            logger.info(`Logging to directory: '${directory}' filename: ${logFilename}`);
        }
        cleanup();
    }
    else if (output.includes('console')) {
        logger.info(`Logging to console only'`);
    }
}
function addTransport(transport) {
    transport.level = transportsToUse[0].level;
    logger.add(transport);
}
function getLevel() {
    return winstonToZ2mLevel(transportsToUse[0].level);
}
function setLevel(level) {
    logger.transports.forEach((transport) => transport.level = z2mToWinstonLevel(level));
}
function warn(message) {
    // winston.config.syslog.levels doesn't have warn, but is required for syslog.
    logger.warning(message);
}
function warning(message) {
    logger.warning(message);
}
function info(message) {
    logger.info(message);
}
function debug(message) {
    logger.debug(message);
}
function error(message) {
    logger.error(message);
}
// Workaround for https://github.com/winstonjs/winston/issues/1629.
// https://github.com/Koenkk/zigbee2mqtt/pull/10905
/* istanbul ignore next */
async function end() {
    logger.end();
    await new Promise((resolve) => {
        if (!fileTransport) {
            process.nextTick(resolve);
        }
        else {
            // @ts-ignore
            if (fileTransport._dest) {
                // @ts-ignore
                fileTransport._dest.on('finish', resolve);
            }
            else {
                // @ts-ignore
                fileTransport.on('open', () => fileTransport._dest.on('finish', resolve));
            }
        }
    });
}
exports.default = {
    init, logOutput, warn, warning, error, info, debug, setLevel, getLevel, cleanup, addTransport, end,
    winston: () => logger,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3V0aWwvbG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzREFBOEI7QUFDOUIsb0RBQTRCO0FBQzVCLHFEQUF1QztBQUN2QyxnREFBd0I7QUFDeEIsNENBQW9CO0FBQ3BCLHNFQUFpQztBQUNqQyxtQ0FBa0M7QUFDbEMsb0RBQTRCO0FBRTVCLE1BQU0sU0FBUyxHQUFHLGlCQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO0FBSzVDLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxLQUFrQixFQUFtQixFQUFFLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDeEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLEtBQXNCLEVBQWUsRUFBRSxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBRXhHLE1BQU0sMEJBQTBCLEdBQTBCO0lBQ3RELE1BQU0sRUFBRSxPQUFPO0lBQ2YsT0FBTyxFQUFFLE9BQU87SUFDaEIsTUFBTSxFQUFFLE9BQU87SUFDZixPQUFPLEVBQUUsT0FBTztDQUNuQixDQUFDO0FBRUYsSUFBSSxNQUFzQixDQUFDO0FBQzNCLElBQUksYUFBaUMsQ0FBQztBQUN0QyxJQUFJLE1BQWdCLENBQUM7QUFDckIsSUFBSSxTQUFpQixDQUFDO0FBQ3RCLElBQUksV0FBbUIsQ0FBQztBQUN4QixJQUFJLGVBQW9DLENBQUM7QUFFekMsU0FBUyxJQUFJO0lBQ1QsNEJBQTRCO0lBQzVCLE1BQU0sR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUU1QyxzQkFBc0I7SUFDdEIsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBTSxF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