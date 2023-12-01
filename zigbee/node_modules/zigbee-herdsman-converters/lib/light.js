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
Object.defineProperty(exports, "__esModule", { value: true });
exports.configure = exports.clampColorTemp = exports.findColorTempRange = exports.readColorAttributes = void 0;
const utils = __importStar(require("./utils"));
async function readColorCapabilities(endpoint) {
    await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
}
async function readColorTempMinMax(endpoint) {
    await endpoint.read('lightingColorCtrl', ['colorTempPhysicalMin', 'colorTempPhysicalMax']);
}
function readColorAttributes(entity, meta, additionalAttributes = []) {
    /**
      * Not all bulbs support the same features, we need to take care we read what is supported.
      * `supportsHueAndSaturation` indicates support for currentHue and currentSaturation
      * `supportsEnhancedHue` indicates support for enhancedCurrentHue
      *
      * e.g. IKEA Tådfri LED1624G9 only supports XY (https://github.com/Koenkk/zigbee-herdsman-converters/issues/1340)
      *
      * Additionally when we get a "get payload", only request the fields included.
     */
    const attributes = ['colorMode'];
    if (meta && meta.message) {
        if (!meta.message.color || (typeof meta.message.color === 'object' && meta.message.color.hasOwnProperty('x'))) {
            attributes.push('currentX');
        }
        if (!meta.message.color || (typeof meta.message.color === 'object' && meta.message.color.hasOwnProperty('y'))) {
            attributes.push('currentY');
        }
        if (utils.getMetaValue(entity, meta.mapped, 'supportsHueAndSaturation', 'allEqual', true)) {
            if (!meta.message.color || (typeof meta.message.color === 'object' && meta.message.color.hasOwnProperty('hue'))) {
                if (utils.getMetaValue(entity, meta.mapped, 'supportsEnhancedHue', 'allEqual', true)) {
                    attributes.push('enhancedCurrentHue');
                }
                else {
                    attributes.push('currentHue');
                }
            }
            if (!meta.message.color || (typeof meta.message.color === 'object' && meta.message.color.hasOwnProperty('saturation'))) {
                attributes.push('currentSaturation');
            }
        }
    }
    return [...attributes, ...additionalAttributes];
}
exports.readColorAttributes = readColorAttributes;
function findColorTempRange(entity, logger) {
    let colorTempMin;
    let colorTempMax;
    if (utils.isGroup(entity)) {
        const minCandidates = entity.members.map((m) => m.getClusterAttributeValue('lightingColorCtrl', 'colorTempPhysicalMin'))
            .filter((v) => v != null).map((v) => Number(v));
        if (minCandidates.length > 0) {
            colorTempMin = Math.max(...minCandidates);
        }
        const maxCandidates = entity.members.map((m) => m.getClusterAttributeValue('lightingColorCtrl', 'colorTempPhysicalMax'))
            .filter((v) => v != null).map((v) => Number(v));
        if (maxCandidates.length > 0) {
            colorTempMax = Math.min(...maxCandidates);
        }
    }
    else {
        colorTempMin = entity.getClusterAttributeValue('lightingColorCtrl', 'colorTempPhysicalMin');
        colorTempMax = entity.getClusterAttributeValue('lightingColorCtrl', 'colorTempPhysicalMax');
    }
    if ((colorTempMin == null) || (colorTempMax == null)) {
        const entityId = utils.isGroup(entity) ? entity.groupID : entity.deviceIeeeAddress;
        logger.debug(`Missing colorTempPhysicalMin and/or colorTempPhysicalMax for ${utils.isGroup(entity) ? 'group' : 'endpoint'} ${entityId}!`);
    }
    return [colorTempMin, colorTempMax];
}
exports.findColorTempRange = findColorTempRange;
function clampColorTemp(colorTemp, colorTempMin, colorTempMax, logger) {
    if ((colorTempMin != null) && (colorTemp < colorTempMin)) {
        logger.debug(`Requested color_temp ${colorTemp} is lower than minimum supported ${colorTempMin}, using minimum!`);
        return colorTempMin;
    }
    if ((colorTempMax != null) && (colorTemp > colorTempMax)) {
        logger.debug(`Requested color_temp ${colorTemp} is higher than maximum supported ${colorTempMax}, using maximum!`);
        return colorTempMax;
    }
    return colorTemp;
}
exports.clampColorTemp = clampColorTemp;
async function configure(device, coordinatorEndpoint, logger, readColorTempMinMaxAttribute) {
    if (device.powerSource === 'Unknown') {
        device.powerSource = 'Mains (single phase)';
        device.save();
    }
    for (const endpoint of device.endpoints.filter((e) => e.supportsInputCluster('lightingColorCtrl'))) {
        try {
            await readColorCapabilities(endpoint);
            if (readColorTempMinMaxAttribute) {
                await readColorTempMinMax(endpoint);
            }
        }
        catch (e) { /* Fails for some, e.g. https://github.com/Koenkk/zigbee2mqtt/issues/5717 */ }
    }
}
exports.configure = configure;
exports.readColorCapabilities = readColorCapabilities;
exports.readColorTempMinMax = readColorTempMinMax;
exports.readColorAttributes = readColorAttributes;
exports.findColorTempRange = findColorTempRange;
exports.clampColorTemp = clampColorTemp;
exports.configure = configure;
//# sourceMappingURL=light.js.map