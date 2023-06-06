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
                const extensionFilePath = path_1.default.join(basePath, fileName);
                return { 'name': fileName, 'code': fs_1.default.readFileSync(extensionFilePath, 'utf-8') };
            });
        }
        else {
            return [];
        }
    }
    async removeExtension(message) {
        const { name } = message;
        const extensions = this.getListOfUserDefinedExtensions();
        const extensionToBeRemoved = extensions.find((e) => e.name === name);
        if (extensionToBeRemoved) {
            await this.enableDisableExtension(false, extensionToBeRemoved.name);
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
    async saveExtension(message) {
        const { name, code } = message;
        const ModuleConstructor = utils_1.default.loadModuleFromText(code, name);
        await this.loadExtension(ModuleConstructor);
        const basePath = this.getExtensionsBasePath();
        /* istanbul ignore else */
        if (!fs_1.default.existsSync(basePath)) {
            fs_1.default.mkdirSync(basePath);
        }
        const extensionFilePath = path_1.default.join(basePath, path_1.default.basename(name));
        fs_1.default.writeFileSync(extensionFilePath, code);
        this.publishExtensions();
        logger_1.default.info(`Extension ${name} loaded`);
        return utils_1.default.getResponse(message, {}, null);
    }
    async onMQTTMessage(data) {
        const match = data.topic.match(requestRegex);
        if (match && this.requestLookup[match[1].toLowerCase()]) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const response = await this.requestLookup[match[1].toLowerCase()](message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                const response = utils_1.default.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/extension/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    async loadExtension(ConstructorClass) {
        await this.enableDisableExtension(false, ConstructorClass.name);
        // @ts-ignore
        await this.addExtension(new ConstructorClass(this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus, settings, logger_1.default));
    }
    loadUserDefinedExtensions() {
        const extensions = this.getListOfUserDefinedExtensions();
        extensions
            .map(({ code, name }) => utils_1.default.loadModuleFromText(code, name))
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
exports.default = ExternalExtension;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxFeHRlbnNpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvZXh0ZW5zaW9uL2V4dGVybmFsRXh0ZW5zaW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyREFBNkM7QUFDN0MsMERBQWtDO0FBQ2xDLDRDQUFvQjtBQUNwQiwwREFBa0M7QUFDbEMsZ0RBQXdCO0FBQ3hCLDhEQUFzQztBQUN0QyxrSEFBOEQ7QUFDOUQsb0VBQWtDO0FBQ2xDLDREQUFvQztBQUVwQyxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSx5Q0FBeUMsQ0FBQyxDQUFDO0FBRTVHLE1BQXFCLGlCQUFrQixTQUFRLG1CQUFTO0lBRzNDLEtBQUssQ0FBQyxLQUFLO1FBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDakMsTUFBTSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRU8scUJBQXFCO1FBQ3pCLE9BQU8sY0FBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRU8sOEJBQThCO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlDLElBQUksWUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUN6QixPQUFPLFlBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFD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