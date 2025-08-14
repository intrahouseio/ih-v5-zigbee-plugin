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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const moment_1 = __importDefault(require("moment"));
const rimraf_1 = require("rimraf");
const winston_1 = __importDefault(require("winston"));
const settings = __importStar(require("./settings"));
const NAMESPACE_SEPARATOR = ":";
class Logger {
    // @ts-expect-error initalized in `init`
    level;
    // @ts-expect-error initalized in `init`
    output;
    // @ts-expect-error initalized in `init`
    directory;
    // @ts-expect-error initalized in `init`
    logger;
    // @ts-expect-error initalized in `init`
    fileTransport;
    debugNamespaceIgnoreRegex;
    // @ts-expect-error initalized in `init`
    namespacedLevels;
    // @ts-expect-error initalized in `init`
    cachedNamespacedLevels;
    init() {
        // What transports to enable
        this.output = settings.get().advanced.log_output;
        // Directory to log to
        const timestamp = (0, moment_1.default)(Date.now()).format("YYYY-MM-DD.HH-mm-ss");
        this.directory = settings.get().advanced.log_directory.replace("%TIMESTAMP%", timestamp);
        const logFilename = settings.get().advanced.log_file.replace("%TIMESTAMP%", timestamp);
        this.level = settings.get().advanced.log_level;
        this.namespacedLevels = settings.get().advanced.log_namespaced_levels;
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
        (0, node_assert_1.default)(settings.LOG_LEVELS.includes(this.level), `'${this.level}' is not valid log_level, use one of '${settings.LOG_LEVELS.join(", ")}'`);
        const timestampFormat = () => (0, moment_1.default)().format(settings.get().advanced.timestamp_format);
        this.logger = winston_1.default.createLogger({
            level: "debug",
            format: winston_1.default.format.combine(winston_1.default.format.errors({ stack: true }), winston_1.default.format.timestamp({ format: timestampFormat })),
            levels: winston_1.default.config.syslog.levels,
        });
        const consoleSilenced = !this.output.includes("console");
        // Print to user what logging is active
        let logging = `Logging to console${consoleSilenced ? " (silenced)" : ""}`;
        // Setup default console logger
        this.logger.add(new winston_1.default.transports.Console({
            silent: consoleSilenced,
            format: settings.get().advanced.log_console_json
                ? winston_1.default.format.json()
                : winston_1.default.format.combine(
                // winston.config.syslog.levels sets 'warning' as 'red'
                winston_1.default.format.colorize({ colors: { debug: "blue", info: "green", warning: "yellow", error: "red" } }), winston_1.default.format.printf((info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.message}`;
                })),
        }));
        if (this.output.includes("file")) {
            logging += `, file (filename: ${logFilename})`;
            // Make sure that log directory exists when not logging to stdout only
            node_fs_1.default.mkdirSync(this.directory, { recursive: true });
            if (settings.get().advanced.log_symlink_current) {
                const current = settings.get().advanced.log_directory.replace("%TIMESTAMP%", "current");
                const actual = `./${timestamp}`;
                /* v8 ignore start */
                if (node_fs_1.default.existsSync(current)) {
                    node_fs_1.default.unlinkSync(current);
                }
                /* v8 ignore stop */
                node_fs_1.default.symlinkSync(actual, current);
            }
            // Add file logger when enabled
            // NOTE: the initiation of the logger even when not added as transport tries to create the logging directory
            const transportFileOptions = {
                filename: node_path_1.default.join(this.directory, logFilename),
                format: winston_1.default.format.printf((info) => {
                    return `[${info.timestamp}] ${info.level}: \t${info.message}`;
                }),
            };
            if (settings.get().advanced.log_rotation) {
                transportFileOptions.tailable = true;
                transportFileOptions.maxFiles = 3; // Keep last 3 files
                transportFileOptions.maxsize = 10000000; // 10MB
            }
            this.fileTransport = new winston_1.default.transports.File(transportFileOptions);
            this.logger.add(this.fileTransport);
            this.cleanup();
        }
        /* v8 ignore start */
        if (this.output.includes("syslog")) {
            logging += ", syslog";
            require("winston-syslog").Syslog;
            const options = {
                app_name: "Zigbee2MQTT",
                format: winston_1.default.format.printf((info) => info.message),
                ...settings.get().advanced.log_syslog,
            };
            if (options.type !== undefined) {
                options.type = options.type.toString();
            }
            // @ts-expect-error untyped transport
            this.logger.add(new winston_1.default.transports.Syslog(options));
        }
        /* v8 ignore stop */
        this.setDebugNamespaceIgnore(settings.get().advanced.log_debug_namespace_ignore);
        this.info(logging);
    }
    get winston() {
        return this.logger;
    }
    addTransport(transport) {
        this.logger.add(transport);
    }
    removeTransport(transport) {
        this.logger.remove(transport);
    }
    getDebugNamespaceIgnore() {
        return (this.debugNamespaceIgnoreRegex
            ?.toString()
            .slice(1, -1) /* remove slashes */ ?? "");
    }
    setDebugNamespaceIgnore(value) {
        this.debugNamespaceIgnoreRegex = value !== "" ? new RegExp(value) : undefined;
    }
    getLevel() {
        return this.level;
    }
    setLevel(level) {
        this.level = level;
        this.resetCachedNamespacedLevels();
    }
    getNamespacedLevels() {
        return this.namespacedLevels;
    }
    setNamespacedLevels(nsLevels) {
        this.namespacedLevels = nsLevels;
        this.resetCachedNamespacedLevels();
    }
    resetCachedNamespacedLevels() {
        this.cachedNamespacedLevels = Object.assign({}, this.namespacedLevels);
    }
    cacheNamespacedLevel(namespace) {
        let cached = namespace;
        while (this.cachedNamespacedLevels[namespace] === undefined) {
            const sep = cached.lastIndexOf(NAMESPACE_SEPARATOR);
            if (sep === -1) {
                this.cachedNamespacedLevels[namespace] = this.level;
                return this.level;
            }
            cached = cached.slice(0, sep);
            this.cachedNamespacedLevels[namespace] = this.cachedNamespacedLevels[cached];
        }
        return this.cachedNamespacedLevels[namespace];
    }
    log(level, messageOrLambda, namespace) {
        const nsLevel = this.cacheNamespacedLevel(namespace);
        if (settings.LOG_LEVELS.indexOf(level) <= settings.LOG_LEVELS.indexOf(nsLevel)) {
            const message = messageOrLambda instanceof Function ? messageOrLambda() : messageOrLambda;
            this.logger.log(level, `${namespace}: ${message}`);
        }
    }
    error(messageOrLambda, namespace = "z2m") {
        this.log("error", messageOrLambda, namespace);
    }
    warning(messageOrLambda, namespace = "z2m") {
        this.log("warning", messageOrLambda, namespace);
    }
    info(messageOrLambda, namespace = "z2m") {
        this.log("info", messageOrLambda, namespace);
    }
    debug(messageOrLambda, namespace = "z2m") {
        if (this.debugNamespaceIgnoreRegex?.test(namespace)) {
            return;
        }
        this.log("debug", messageOrLambda, namespace);
    }
    // Cleanup any old log directory.
    cleanup() {
        if (settings.get().advanced.log_directory.includes("%TIMESTAMP%")) {
            const rootDirectory = node_path_1.default.join(this.directory, "..");
            let directories = node_fs_1.default.readdirSync(rootDirectory).map((d) => {
                d = node_path_1.default.join(rootDirectory, d);
                return { path: d, birth: node_fs_1.default.statSync(d).mtime };
            });
            directories.sort((a, b) => b.birth - a.birth);
            directories = directories.slice(settings.get().advanced.log_directories_to_keep, directories.length);
            for (const dir of directories) {
                this.debug(`Removing old log directory '${dir.path}'`);
                (0, rimraf_1.rimrafSync)(dir.path);
            }
        }
    }
    // Workaround for https://github.com/winstonjs/winston/issues/1629.
    // https://github.com/Koenkk/zigbee2mqtt/pull/10905
    /* v8 ignore start */
    async end() {
        // Only flush the file transport, don't end logger itself as log() might still be called
        // causing a UnhandledPromiseRejection (`Error: write after end`). Flushing the file transport
        // ensures the log files are written before stopping.
        if (this.fileTransport) {
            await new Promise((resolve) => {
                // @ts-expect-error workaround
                if (this.fileTransport._dest) {
                    // @ts-expect-error workaround
                    this.fileTransport._dest.on("finish", resolve);
                }
                else {
                    // @ts-expect-error workaround
                    this.fileTransport.on("open", () => this.fileTransport._dest.on("finish", resolve));
                }
                this.fileTransport.end();
            });
        }
    }
}
exports.default = new Logger();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL3V0aWwvbG9nZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOERBQWlDO0FBQ2pDLHNEQUF5QjtBQUN6QiwwREFBNkI7QUFFN0Isb0RBQTRCO0FBQzVCLG1DQUFrQztBQUNsQyxzREFBOEI7QUFFOUIscURBQXVDO0FBRXZDLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDO0FBRWhDLE1BQU0sTUFBTTtJQUNSLHdDQUF3QztJQUNoQyxLQUFLLENBQW9CO0lBQ2pDLHdDQUF3QztJQUNoQyxNQUFNLENBQVc7SUFDekIsd0NBQXdDO0lBQ2hDLFNBQVMsQ0FBUztJQUMxQix3Q0FBd0M7SUFDaEMsTUFBTSxDQUFpQjtJQUMvQix3Q0FBd0M7SUFDaEMsYUFBYSxDQUEyQztJQUN4RCx5QkFBeUIsQ0FBVTtJQUMzQyx3Q0FBd0M7SUFDaEMsZ0JBQWdCLENBQW9DO0lBQzVELHdDQUF3QztJQUNoQyxzQkFBc0IsQ0FBb0M7SUFFM0QsSUFBSTtRQUNQLDRCQUE0QjtRQUM1QixJQUFJLENBQUMsTUFBTSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1FBQ2pELHNCQUFzQjtRQUN0QixNQUFNLFNBQVMsR0FBRyxJQUFBLGdCQUFNLEVBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztRQUMvQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQztRQUN0RSxJQUFJLENBQUMsc0JBQXNCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdkUsSUFBQSxxQkFBTSxFQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLHlDQUF5QyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0ksTUFBTSxlQUFlLEdBQUcsR0FBVyxFQUFFLENBQUMsSUFBQSxnQkFBTSxHQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUVoRyxJQUFJLENBQUMsTUFBTSxHQUFHLGlCQUFPLENBQUMsWUFBWSxDQUFDO1lBQy9CLEtBQUssRUFBRSxPQUFPO1lBQ2QsTUFBTSxFQUFFLGlCQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxpQkFBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFDLENBQUMsRUFBRSxpQkFBTyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBQyxNQUFNLEVBQUUsZUFBZSxFQUFDLENBQUMsQ0FBQztZQUN6SCxNQUFNLEVBQUUsaUJBQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU07U0FDdkMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxlQUFlLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN6RCx1Q0FBdUM7UUFDdkMsSUFBSSxPQUFPLEdBQUcscUJBQXFCLGVBQWUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUUxRSwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQ1gsSUFBSSxpQkFBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUM7WUFDM0IsTUFBTSxFQUFFLGVBQWU7WUFDdkIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCO2dCQUM1QyxDQUFDLENBQUMsaUJBQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFO2dCQUN2QixDQUFDLENBQUMsaUJBQU8sQ0FBQyxNQUFNLENBQUMsT0FBTztnQkFDbEIsdURBQXVEO2dCQUN2RCxpQkFBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBQyxNQUFNLEVBQUUsRUFBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFDLEVBQUMsQ0FBQyxFQUNsRyxpQkFBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRTtvQkFDM0IsT0FBTyxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLEtBQUssT0FBTyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2xFLENBQUMsQ0FBQyxDQUNMO1NBQ1YsQ0FBQyxDQUNMLENBQUM7UUFFRixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDL0IsT0FBTyxJQUFJLHFCQUFxQixXQUFXLEdBQUcsQ0FBQztZQUUvQyxzRUFBc0U7WUFDdEUsaUJBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDO1lBRWhELElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUM5QyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUN4RixNQUFNLE1BQU0sR0FBRyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUVoQyxxQkFBcUI7Z0JBQ3JCLElBQUksaUJBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDekIsaUJBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7Z0JBQ0Qsb0JBQW9CO2dCQUVwQixpQkFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEMsQ0FBQztZQUVELCtCQUErQjtZQUMvQiw0R0FBNEc7WUFDNUcsTUFBTSxvQkFBb0IsR0FBNEM7Z0JBQ2xFLFFBQVEsRUFBRSxtQkFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQztnQkFDaEQsTUFBTSxFQUFFLGlCQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO29CQUNuQyxPQUFPLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsS0FBSyxPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDbEUsQ0FBQyxDQUFDO2FBQ0wsQ0FBQztZQUVGLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDdkMsb0JBQW9CLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztnQkFDckMsb0JBQW9CLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLG9CQUFvQjtnQkFDdkQsb0JBQW9CLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLE9BQU87WUFDcEQsQ0FBQztZQUVELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxpQkFBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUN2RSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFFRCxxQkFBcUI7UUFDckIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sSUFBSSxVQUFVLENBQUM7WUFDdEIsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxDQUFDO1lBRWpDLE1BQU0sT0FBTyxHQUFhO2dCQUN0QixRQUFRLEVBQUUsYUFBYTtnQkFDdkIsTUFBTSxFQUFFLGlCQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQWlCLENBQUM7Z0JBQy9ELEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVO2FBQ3hDLENBQUM7WUFFRixJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMzQyxDQUFDO1lBRUQscUNBQXFDO1lBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUNELG9CQUFvQjtRQUVwQixJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBRWpGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVELElBQUksT0FBTztRQUNQLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sWUFBWSxDQUFDLFNBQTRCO1FBQzVDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFTSxlQUFlLENBQUMsU0FBNEI7UUFDL0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVNLHVCQUF1QjtRQUMxQixPQUFPLENBQ0gsSUFBSSxDQUFDLHlCQUF5QjtZQUMxQixFQUFFLFFBQVEsRUFBRTthQUNYLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsSUFBSSxFQUFFLENBQy9DLENBQUM7SUFDTixDQUFDO0lBRU0sdUJBQXVCLENBQUMsS0FBYTtRQUN4QyxJQUFJLENBQUMseUJBQXlCLEdBQUcsS0FBSyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNsRixDQUFDO0lBRU0sUUFBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUN0QixDQUFDO0lBRU0sUUFBUSxDQUFDLEtBQXdCO1FBQ3BDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFTSxtQkFBbUI7UUFDdEIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDakMsQ0FBQztJQUVNLG1CQUFtQixDQUFDLFFBQTJDO1FBQ2xFLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxRQUFRLENBQUM7UUFDakMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVPLDJCQUEyQjtRQUMvQixJQUFJLENBQUMsc0JBQXNCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFNBQWlCO1FBQzFDLElBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUV2QixPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMxRCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFFcEQsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFFcEQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ3RCLENBQUM7WUFFRCxNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUIsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVPLEdBQUcsQ0FBQyxLQUF3QixFQUFFLGVBQXdDLEVBQUUsU0FBaUI7UUFDN0YsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXJELElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3RSxNQUFNLE9BQU8sR0FBVyxlQUFlLFlBQVksUUFBUSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO1lBQ2xHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDTCxDQUFDO0lBRU0sS0FBSyxDQUFDLGVBQXdDLEVBQUUsU0FBUyxHQUFHLEtBQUs7UUFDcEUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTSxPQUFPLENBQUMsZUFBd0MsRUFBRSxTQUFTLEdBQUcsS0FBSztRQUN0RSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVNLElBQUksQ0FBQyxlQUF3QyxFQUFFLFNBQVMsR0FBRyxLQUFLO1FBQ25FLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRU0sS0FBSyxDQUFDLGVBQXdDLEVBQUUsU0FBUyxHQUFHLEtBQUs7UUFDcEUsSUFBSSxJQUFJLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDbEQsT0FBTztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELGlDQUFpQztJQUN6QixPQUFPO1FBQ1gsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztZQUNoRSxNQUFNLGFBQWEsR0FBRyxtQkFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRXRELElBQUksV0FBVyxHQUFHLGlCQUFFLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUN0RCxDQUFDLEdBQUcsbUJBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxPQUFPLEVBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsaUJBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFDLENBQUM7WUFDbEQsQ0FBQyxDQUFDLENBQUM7WUFFSCxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBVyxFQUFFLENBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEUsV0FBVyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFckcsS0FBSyxNQUFNLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7Z0JBQ3ZELElBQUEsbUJBQVUsRUFBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDekIsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsbUVBQW1FO0lBQ25FLG1EQUFtRDtJQUNuRCxxQkFBcUI7SUFDZCxLQUFLLENBQUMsR0FBRztRQUNaLHdGQUF3RjtRQUN4Riw4RkFBOEY7UUFDOUYscURBQXFEO1FBQ3JELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3JCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDaEMsOEJBQThCO2dCQUM5QixJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzNCLDhCQUE4QjtvQkFDOUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDbkQsQ0FBQztxQkFBTSxDQUFDO29CQUNKLDhCQUE4QjtvQkFDOUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFDeEYsQ0FBQztnQkFDRCxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzdCLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNMLENBQUM7Q0FFSjtBQUVELGtCQUFlLElBQUksTUFBTSxFQUFFLENBQUMifQ==