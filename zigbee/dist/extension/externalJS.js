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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const data_1 = __importDefault(require("../util/data"));
const logger_1 = __importDefault(require("../util/logger"));
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const SUPPORTED_OPERATIONS = ["save", "remove"];
const TMP_PREFIX = ".tmp-ed42d4f2-";
class ExternalJSExtension extends extension_1.default {
    folderName;
    mqttTopic;
    requestRegex;
    basePath;
    nodeModulesSymlinked = false;
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension, mqttTopic, folderName) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        this.folderName = folderName;
        this.mqttTopic = mqttTopic;
        this.requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/${mqttTopic}/(save|remove)`);
        this.basePath = data_1.default.joinPath(folderName);
    }
    /**
     * In case the external JS is not in the Z2M install dir (e.g. when `ZIGBEE2MQTT_DATA` is used), the external
     * JS cannot import from `node_modules`.
     * To workaround this create a symlink to `node_modules` in the external JS dir.
     * https://nodejs.org/api/esm.html#no-node_path
     */
    symlinkNodeModulesIfNecessary() {
        if (!this.nodeModulesSymlinked) {
            this.nodeModulesSymlinked = true;
            const nodeModulesPath = node_path_1.default.join(__dirname, "..", "..", "node_modules");
            const z2mDirNormalized = `${node_path_1.default.resolve(node_path_1.default.join(nodeModulesPath, ".."))}${node_path_1.default.sep}`;
            const basePathNormalized = `${node_path_1.default.resolve(this.basePath)}${node_path_1.default.sep}`;
            const basePathInZ2mDir = basePathNormalized.startsWith(z2mDirNormalized);
            if (!basePathInZ2mDir) {
                logger_1.default.debug(`External JS folder '${this.folderName}' is outside the Z2M install dir, creating a symlink to 'node_modules'`);
                const nodeModulesSymlink = node_path_1.default.join(this.basePath, "node_modules");
                if (node_fs_1.default.existsSync(nodeModulesSymlink)) {
                    node_fs_1.default.unlinkSync(nodeModulesSymlink);
                }
                // Type `junction` is required on Windows.
                // https://github.com/nodejs/node/issues/18518#issuecomment-513866491
                /* v8 ignore next */
                node_fs_1.default.symlinkSync(nodeModulesPath, nodeModulesSymlink, node_os_1.default.platform() === "win32" ? "junction" : "dir");
            }
        }
    }
    async start() {
        await super.start();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.loadFiles();
        await this.publishExternalJS();
    }
    getFilePath(name, mkBasePath = false) {
        if (mkBasePath && !node_fs_1.default.existsSync(this.basePath)) {
            node_fs_1.default.mkdirSync(this.basePath, { recursive: true });
        }
        return node_path_1.default.join(this.basePath, name);
    }
    getFileCode(name) {
        return node_fs_1.default.readFileSync(this.getFilePath(name), "utf8");
    }
    *getFiles() {
        if (node_fs_1.default.existsSync(this.basePath)) {
            for (const fileName of node_fs_1.default.readdirSync(this.basePath)) {
                if (!fileName.startsWith(TMP_PREFIX) && (fileName.endsWith(".js") || fileName.endsWith(".cjs") || fileName.endsWith(".mjs"))) {
                    yield { name: fileName, code: this.getFileCode(fileName) };
                }
            }
        }
    }
    async onMQTTMessage(data) {
        const match = data.topic.match(this.requestRegex);
        if (match && SUPPORTED_OPERATIONS.includes(match[1].toLowerCase())) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                let response;
                if (match[1].toLowerCase() === "save") {
                    response = await this.save(message);
                }
                else {
                    response = await this.remove(message);
                }
                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                const response = utils_1.default.getResponse(message, {}, `${error.message}`);
                await this.mqtt.publish(`bridge/response/${this.mqttTopic}/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    async remove(message) {
        if (!message.name) {
            return utils_1.default.getResponse(message, {}, "Invalid payload");
        }
        const { name } = message;
        const toBeRemoved = this.getFilePath(name);
        if (node_fs_1.default.existsSync(toBeRemoved)) {
            const mod = await this.importFile(toBeRemoved);
            await this.removeJS(name, mod.default);
            node_fs_1.default.rmSync(toBeRemoved, { force: true });
            logger_1.default.info(`${name} (${toBeRemoved}) removed.`);
            await this.publishExternalJS();
            return utils_1.default.getResponse(message, {});
        }
        return utils_1.default.getResponse(message, {}, `${name} (${toBeRemoved}) doesn't exists`);
    }
    async save(message) {
        if (!message.name || !message.code) {
            return utils_1.default.getResponse(message, {}, "Invalid payload");
        }
        const { name, code } = message;
        const filePath = this.getFilePath(name, true);
        try {
            node_fs_1.default.writeFileSync(filePath, code, "utf8");
            this.symlinkNodeModulesIfNecessary();
            const mod = await this.importFile(filePath);
            await this.loadJS(name, mod.default, name);
            logger_1.default.info(`${name} loaded. Contents written to '${filePath}'.`);
            await this.publishExternalJS();
            return utils_1.default.getResponse(message, {});
        }
        catch (error) {
            return utils_1.default.getResponse(message, {}, `${name} contains invalid code: ${error.message}`);
        }
    }
    async loadFiles() {
        for (const extension of this.getFiles()) {
            this.symlinkNodeModulesIfNecessary();
            const filePath = this.getFilePath(extension.name);
            try {
                const mod = await this.importFile(filePath);
                await this.loadJS(extension.name, mod.default);
            }
            catch (error) {
                // change ext so Z2M doesn't try to load it again and again
                node_fs_1.default.renameSync(filePath, `${filePath}.invalid`);
                logger_1.default.error(`Invalid external ${this.mqttTopic} '${extension.name}' was ignored and renamed to prevent interference with Zigbee2MQTT. (${error.message})`);
                // biome-ignore lint/style/noNonNullAssertion: always Error
                logger_1.default.debug(error.stack);
            }
        }
    }
    async publishExternalJS() {
        await this.mqtt.publish(`bridge/${this.mqttTopic}s`, (0, json_stable_stringify_without_jsonify_1.default)(Array.from(this.getFiles())), {
            clientOptions: { retain: true },
            skipLog: true,
        });
    }
    // biome-ignore lint/suspicious/noExplicitAny: dynamic module
    async importFile(file) {
        const ext = node_path_1.default.extname(file);
        // Create the file in a temp path to bypass node module cache when importing multiple times.
        const tmpFile = node_path_1.default.join(this.basePath, `${TMP_PREFIX}${node_path_1.default.basename(file, ext)}-${require("crypto").randomUUID()}${ext}`);
        node_fs_1.default.copyFileSync(file, tmpFile);
        try {
            // Do `replaceAll("\\", "/")` to prevent issues on Windows
            /* v8 ignore next */
            const mod = await import(node_os_1.default.platform() === "win32" ? `file:///${tmpFile.replaceAll("\\", "/")}` : tmpFile);
            return mod;
        }
        finally {
            node_fs_1.default.rmSync(tmpFile);
        }
    }
}
exports.default = ExternalJSExtension;
__decorate([
    bind_decorator_1.default
], ExternalJSExtension.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], ExternalJSExtension.prototype, "remove", null);
__decorate([
    bind_decorator_1.default
], ExternalJSExtension.prototype, "save", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxKUy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vZXh0ZXJuYWxKUy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNEQUF5QjtBQUN6QixzREFBeUI7QUFDekIsMERBQTZCO0FBQzdCLG9FQUFrQztBQUNsQyxrSEFBOEQ7QUFHOUQsd0RBQWdDO0FBQ2hDLDREQUFvQztBQUNwQywyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLDREQUFvQztBQUVwQyxNQUFNLG9CQUFvQixHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQ2hELE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFDO0FBRXBDLE1BQThCLG1CQUF1QixTQUFRLG1CQUFTO0lBQ3hELFVBQVUsQ0FBUztJQUNuQixTQUFTLENBQVM7SUFDbEIsWUFBWSxDQUFTO0lBQ3JCLFFBQVEsQ0FBUztJQUNqQixvQkFBb0IsR0FBRyxLQUFLLENBQUM7SUFFdkMsWUFDSSxNQUFjLEVBQ2QsSUFBVSxFQUNWLEtBQVksRUFDWixrQkFBc0MsRUFDdEMsUUFBa0IsRUFDbEIsc0JBQXdFLEVBQ3hFLGVBQW9DLEVBQ3BDLFlBQXFELEVBQ3JELFNBQWlCLEVBQ2pCLFVBQWtCO1FBRWxCLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsc0JBQXNCLEVBQUUsZUFBZSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBRWhILElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsbUJBQW1CLFNBQVMs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