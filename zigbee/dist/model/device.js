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
/* eslint-disable brace-style */
const settings = __importStar(require("../util/settings"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
class Device {
    get ieeeAddr() { return this.zh.ieeeAddr; }
    get ID() { return this.zh.ieeeAddr; }
    get options() { return { ...settings.get().device_options, ...settings.getDevice(this.ieeeAddr) }; }
    get name() {
        var _a;
        return this.zh.type === 'Coordinator' ? 'Coordinator' : ((_a = this.options) === null || _a === void 0 ? void 0 : _a.friendly_name) || this.ieeeAddr;
    }
    get definition() {
        // Some devices can change modelID, reconsider the definition in that case.
        // https://github.com/Koenkk/zigbee-herdsman-converters/issues/3016
        if (!this.zh.interviewing && (!this._definition || this._definitionModelID !== this.zh.modelID)) {
            this._definition = zigbee_herdsman_converters_1.default.findByDevice(this.zh);
            this._definitionModelID = this.zh.modelID;
        }
        return this._definition;
    }
    constructor(device) {
        this.zh = device;
    }
    exposes() {
        /* istanbul ignore if */
        if (typeof this.definition.exposes == 'function') {
            return this.definition.exposes(this.zh, this.options);
        }
        else {
            return this.definition.exposes;
        }
    }
    ensureInSettings() {
        if (this.zh.type !== 'Coordinator' && !settings.getDevice(this.zh.ieeeAddr)) {
            settings.addDevice(this.zh.ieeeAddr);
        }
    }
    endpoint(key) {
        var _a, _b, _c;
        let endpoint;
        if (key == null || key == '')
            key = 'default';
        if (!isNaN(Number(key))) {
            endpoint = this.zh.getEndpoint(Number(key));
        }
        else if ((_a = this.definition) === null || _a === void 0 ? void 0 : _a.endpoint) {
            const ID = (_c = (_b = this.definition) === null || _b === void 0 ? void 0 : _b.endpoint) === null || _c === void 0 ? void 0 : _c.call(_b, this.zh)[key];
            if (ID)
                endpoint = this.zh.getEndpoint(ID);
            else if (key === 'default')
                endpoint = this.zh.endpoints[0];
            else
                return null;
        }
        else {
            /* istanbul ignore next */
            if (key !== 'default')
                return null;
            endpoint = this.zh.endpoints[0];
        }
        return endpoint;
    }
    endpointName(endpoint) {
        var _a, _b;
        let name = null;
        if ((_a = this.definition) === null || _a === void 0 ? void 0 : _a.endpoint) {
            name = Object.entries((_b = this.definition) === null || _b === void 0 ? void 0 : _b.endpoint(this.zh)).find((e) => e[1] == endpoint.ID)[0];
        }
        /* istanbul ignore next */
        return name === 'default' ? null : name;
    }
    isIkeaTradfri() { return this.zh.manufacturerID === 4476; }
    isDevice() { return true; }
    /* istanbul ignore next */
    isGroup() { return false; }
}
exports.default = Device;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL21vZGVsL2RldmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsZ0NBQWdDO0FBQ2hDLDJEQUE2QztBQUM3Qyw0RkFBa0U7QUFFbEUsTUFBcUIsTUFBTTtJQUt2QixJQUFJLFFBQVEsS0FBWSxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQztJQUNqRCxJQUFJLEVBQUUsS0FBWSxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQztJQUMzQyxJQUFJLE9BQU8sS0FBbUIsT0FBTyxFQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsRUFBRSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFDLENBQUMsQ0FBQSxDQUFDO0lBQy9HLElBQUksSUFBSTs7UUFDSixPQUFPLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLE9BQU8sMENBQUUsYUFBYSxLQUFJLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDekcsQ0FBQztJQUNELElBQUksVUFBVTtRQUNWLDJFQUEyRTtRQUMzRSxtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQzdGLElBQUksQ0FBQyxXQUFXLEdBQUcsb0NBQXdCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsRSxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUM7U0FDN0M7UUFDRCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDNUIsQ0FBQztJQUVELFlBQVksTUFBaUI7UUFDekIsSUFBSSxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELE9BQU87UUFDSCx3QkFBd0I7UUFDeEIsSUFBSSxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxJQUFJLFVBQVUsRUFBRTtZQUM5QyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQ3pEO2FBQU07WUFDSCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDO1NBQ2xDO0lBQ0wsQ0FBQztJQUVELGdCQUFnQjtRQUNaLElBQUksSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssYUFBYSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3pFLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUN4QztJQUNMLENBQUM7SUFFRCxRQUFRLENBQUMsR0FBcUI7O1FBQzFCLElBQUksUUFBcUIsQ0FBQztRQUMxQixJQUFJLEdBQUcsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7WUFBRSxHQUFHLEdBQUcsU0FBUyxDQUFDO1FBRTlDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUU7WUFDckIsUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQy9DO2FBQU0sSUFBSSxNQUFBLElBQUksQ0FBQyxVQUFVLDBDQUFFLFFBQVEsRUFBRTtZQUNsQyxNQUFNLEVBQUUsR0FBRyxNQUFBLE1BQUEsSUFBSSxDQUFDLFVBQVUsMENBQUUsUUFBUSxtREFBRyxJQUFJLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3JELElBQUksRUFBRTtnQkFBRSxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ3RDLElBQUksR0FBRyxLQUFLLFNBQVM7Z0JBQUUsUUFBUSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDOztnQkFDdkQsT0FBTyxJQUFJLENBQUM7U0FDcEI7YUFBTTtZQUNILDBCQUEwQjtZQUMxQixJQUFJLEdBQUcsS0FBSyxTQUFTO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBQ25DLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNuQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxZQUFZLENBQUMsUUFBcUI7O1FBQzlCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUNoQixJQUFJLE1BQUEsSUFBSSxDQUFDLFVBQVUsMENBQUUsUUFBUSxFQUFFO1lBQzNCLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQUEsSUFBSSxDQUFDLFVBQVUsMENBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNqRztRQUNELDBCQUEwQjtRQUMxQixPQUFPLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzVDLENBQUM7SUFFRCxhQUFhLEtBQWEsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLGNBQWMsS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO0lBRWxFLFFBQVEsS0FBb0IsT0FBTyxJQUFJLENBQUMsQ0FBQSxDQUFDO0lBQ3pDLDBCQUEwQjtJQUMxQixPQUFPLEtBQW1CLE9BQU8sS0FBSyxDQUFDLENBQUEsQ0FBQztDQUMzQztBQTFFRCx5QkEwRUMifQ==