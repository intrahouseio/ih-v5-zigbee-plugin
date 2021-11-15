"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const rimraf_1 = __importDefault(require("rimraf"));
const assert_1 = __importDefault(require("assert"));
const colorizer = winston_1.default.format.colorize();
// What transports to enable
const output = settings.get().advanced.log_output;
// Directory to log to
const timestamp = (0, moment_1.default)(Date.now()).format('YYYY-MM-DD.HH-mm-ss');
const directory = settings.get().advanced.log_directory.replace('%TIMESTAMP%', timestamp);
const logFilename = settings.get().advanced.log_file.replace('%TIMESTAMP%', timestamp);
// Make sure that log directoy exsists when not logging to stdout only
if (output.includes('file')) {
    mkdir_recursive_1.default.mkdirSync(directory);
    if (settings.get().advanced.log_symlink_current) {
        const current = settings.get().advanced.log_directory.replace('%TIMESTAMP%', 'current');
        const actual = './' + timestamp;
        if (fs_1.default.existsSync(current)) {
            fs_1.default.unlinkSync(current);
        }
        fs_1.default.symlinkSync(actual, current);
    }
}
const z2mToWinstonLevel = (level) => level === 'warn' ? 'warning' : level;
const winstonToZ2mLevel = (level) => level === 'warning' ? 'warn' : level;
// Determine the log level.
const z2mLevel = settings.get().advanced.log_level;
const validLevels = ['info', 'error', 'warn', 'debug'];
(0, assert_1.default)(validLevels.includes(z2mLevel), `'${z2mLevel}' is not valid log_level, use one of '${validLevels.join(', ')}'`);
const level = z2mToWinstonLevel(z2mLevel);
const levelWithCompensatedLength = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};
const timestampFormat = () => (0, moment_1.default)().format(settings.get().advanced.timestamp_format);
// Setup default console logger
const transportsToUse = [
    new winston_1.default.transports.Console({
        level,
        silent: !output.includes('console'),
        format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: timestampFormat }), winston_1.default.format.printf(/* istanbul ignore next */ (info) => {
            const { timestamp, level, message } = info;
            const l = winstonToZ2mLevel(level);
            const prefix = colorizer.colorize(l, `Zigbee2MQTT:${levelWithCompensatedLength[l]}`);
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
    transportsToUse.push(new winston_1.default.transports.File(transportFileOptions));
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
// Create logger
const logger = winston_1.default.createLogger({ transports: transportsToUse, levels: winston_1.default.config.syslog.levels });
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
            rimraf_1.default.sync(dir.path);
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
    // winston.config.syslog.levels doesnt have warn, but is required for syslog.
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
exports.default = {
    logOutput, warn, warning, error, info, debug, setLevel, getLevel, cleanup, addTransport, winston: logger,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3V0aWwvbG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNEQUE4QjtBQUM5QixvREFBNEI7QUFDNUIscURBQXVDO0FBQ3ZDLGdEQUF3QjtBQUN4Qiw0Q0FBb0I7QUFDcEIsc0VBQWlDO0FBQ2pDLG9EQUE0QjtBQUM1QixvREFBNEI7QUFFNUIsTUFBTSxTQUFTLEdBQUcsaUJBQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7QUFFNUMsNEJBQTRCO0FBQzVCLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBRWxELHNCQUFzQjtBQUN0QixNQUFNLFNBQVMsR0FBRyxJQUFBLGdCQUFNLEVBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7QUFDbkUsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMxRixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBRXZGLHNFQUFzRTtBQUN0RSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUU7SUFDekIseUJBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFeEIsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFO1FBQzdDLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsYUFB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