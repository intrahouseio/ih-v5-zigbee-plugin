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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const settings = __importStar(require("../util/settings"));
const utils_1 = __importDefault(require("../util/utils"));
const fs_1 = __importDefault(require("fs"));
const data_1 = __importDefault(require("./../util/data"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./../util/logger"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const extension_1 = __importDefault(require("./extension"));
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/extension/(save|remove)`);
class ExternalExtension extends extension_1.default {
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.requestLookup = { 'save': this.saveExtension, 'remove': this.removeExtension };
        this.loadUserDefinedExtensions();
        await this.publishExtensions();
    }
    getExtensionsBasePath() {
        return data_1.default.joinPath('extension');
    }
    getListOfUserDefinedExtensions() {
        const basePath = this.getExtensionsBasePath();
        if (fs_1.default.existsSync(basePath)) {
            return fs_1.default.readdirSync(basePath).filter((f) => f.endsWith('.js')).map((fileName) => {
                const extensonFilePath = path_1.default.join(basePath, fileName);
                return { 'name': fileName, 'code': fs_1.default.readFileSync(extensonFilePath, 'utf-8') };
            });
        }
        else {
            return [];
        }
    }
    removeExtension(message) {
        const { name } = message;
        const extensions = this.getListOfUserDefinedExtensions();
        const extensionToBeRemoved = extensions.find((e) => e.name === name);
        if (extensionToBeRemoved) {
            this.enableDisableExtension(false, extensionToBeRemoved.name);
            const basePath = this.getExtensionsBasePath();
            const extensionFilePath = path_1.default.join(basePath, path_1.default.basename(name));
            fs_1.default.unlinkSync(extensionFilePath);
            this.publishExtensions();
            logger_1.default.info(`Extension ${name} removed`);
            return utils_1.default.getResponse(message, {}, null);
        }
        else {
            return utils_1.default.getResponse(message, {}, `Extension ${name} doesn't exists`);
        }
    }
    saveExtension(message) {
        const { name, code } = message;
        const ModuleConstructor = utils_1.default.loadModuleFromText(code);
        this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs_1.default.existsSync(basePath)) {
            fs_1.default.mkdirSync(basePath);
        }
        const extensonFilePath = path_1.default.join(basePath, path_1.default.basename(name));
        fs_1.default.writeFileSync(extensonFilePath, code);
        this.publishExtensions();
        logger_1.default.info(`Extension ${name} loaded`);
        return utils_1.default.getResponse(message, {}, null);
    }
    async onMQTTMessage(data) {
        const match = data.topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const response = this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                const response = utils_1.default.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    loadExtension(ConstructorClass) {
        this.enableDisableExtension(false, ConstructorClass.constructor.name);
        // @ts-ignore
        this.addExtension(new ConstructorClass(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus, settings, logger_1.default));
    }
    loadUserDefinedExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        extensions
            .map(({ code }) => utils_1.default.loadModuleFromText(code))
            .map(this.loadExtension);
    }
    async publishExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        await this.mqtt.publish('bridge/extensions', (0, json_stable_stringify_without_jsonify_1.default)(extensions), {
            retain: true,
            qos: 0,
        }, settings.get().mqtt.base_topic, true);
    }
}
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "removeExtension", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "saveExtension", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], ExternalExtension.prototype, "loadExtension", null);
exports.default = ExternalExtension;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxFeHRlbnNpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2V4dGVybmFsRXh0ZW5zaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJEQUE2QztBQUM3QywwREFBa0M7QUFDbEMsNENBQW9CO0FBQ3BCLDBEQUFrQztBQUNsQyxnREFBd0I7QUFDeEIsOERBQXNDO0FBQ3RDLGtIQUE4RDtBQUM5RCxvRUFBa0M7QUFDbEMsNERBQW9DO0FBRXBDLE1BQU0sWUFBWSxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHlDQUF5QyxDQUFDLENBQUM7QUFFNUcsTUFBcUIsaUJBQWtCLFNBQVEsbUJBQVM7SUFHM0MsS0FBSyxDQUFDLEtBQUs7UUFDaEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztRQUNqQyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ25DLENBQUM7SUFFTyxxQkFBcUI7UUFDekIsT0FBTyxjQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFTyw4QkFBOEI7UUFDbEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDOUMsSUFBSSxZQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3pCLE9BQU8sWUFBRSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FB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