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
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const humanize_duration_1 = __importDefault(require("humanize-duration"));
const data_1 = __importDefault(require("./data"));
const vm_1 = __importDefault(require("vm"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date) {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = (num) => {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };
    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        plusOrMinus + pad(tzOffset / 60) +
        ':' + pad(tzOffset % 60);
}
const endpointNames = [
    'left', 'right', 'center', 'bottom_left', 'bottom_right', 'default',
    'top_left', 'top_right', 'white', 'rgb', 'cct', 'system', 'top', 'bottom', 'center_left', 'center_right',
    'ep1', 'ep2', 'row_1', 'row_2', 'row_3', 'row_4', 'relay', 'usb',
    'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8',
    'l9', 'l10', 'l11', 'l12', 'l13', 'l14', 'l15', 'l16',
    'button_1', 'button_2', 'button_3', 'button_4', 'button_5',
    'button_6', 'button_7', 'button_8', 'button_9', 'button_10',
    'button_11', 'button_12', 'button_13', 'button_14', 'button_15',
    'button_16', 'button_17', 'button_18', 'button_19', 'button_20',
    'button_light', 'button_fan_high', 'button_fan_med', 'button_fan_low',
    'heat', 'cool', 'water', 'meter', 'wifi',
];
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}
async function getZigbee2MQTTVersion(includeCommitHash = true) {
    const git = await Promise.resolve().then(() => __importStar(require('git-last-commit')));
    const packageJSON = await Promise.resolve().then(() => __importStar(require('../..' + '/package.json')));
    if (!includeCommitHash) {
        return { version: packageJSON.version, commitHash: null };
    }
    return new Promise((resolve) => {
        const version = packageJSON.version;
        git.getLastCommit((err, commit) => {
            let commitHash = null;
            if (err) {
                try {
                    commitHash = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'dist', '.hash'), 'utf-8');
                }
                catch (error) {
                    /* istanbul ignore next */
                    commitHash = 'unknown';
                }
            }
            else {
                commitHash = commit.shortHash;
            }
            resolve({ commitHash, version });
        });
    });
}
async function getDependencyVersion(depend) {
    const packageJSON = await Promise.resolve().then(() => __importStar(require(path_1.default.join(__dirname, '..', '..', 'node_modules', depend, 'package.json'))));
    const version = packageJSON.version;
    return { version };
}
function formatDate(time, type) {
    if (type === 'ISO_8601')
        return new Date(time).toISOString();
    else if (type === 'ISO_8601_local')
        return toLocalISOString(new Date(time));
    else if (type === 'epoch')
        return time;
    else { // relative
        return (0, humanize_duration_1.default)(Date.now() - time, { language: 'en', largest: 2, round: true }) + ' ago';
    }
}
function objectHasProperties(object, properties) {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }
    return true;
}
function equalsPartial(object, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (!(0, es6_1.default)(object[key], value)) {
            return false;
        }
    }
    return true;
}
function getObjectProperty(object, key, defaultValue) {
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
}
function getResponse(request, data, error) {
    const response = { data, status: error ? 'error' : 'ok' };
    if (error)
        response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}
function parseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch (e) {
        return fallback;
    }
}
function loadModuleFromText(moduleCode) {
    const moduleFakePath = path_1.default.join(__dirname, 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm_1.default.runInNewContext(moduleCode, sandbox, moduleFakePath);
    /* eslint-disable-line */ // @ts-ignore
    return sandbox.module.exports;
}
function loadModuleFromFile(modulePath) {
    const moduleCode = fs_1.default.readFileSync(modulePath, { encoding: 'utf8' });
    return loadModuleFromText(moduleCode);
}
function* getExternalConvertersDefinitions(settings) {
    const externalConverters = settings.external_converters;
    for (const moduleName of externalConverters) {
        let converter;
        if (moduleName.endsWith('.js')) {
            converter = loadModuleFromFile(data_1.default.joinPath(moduleName));
        }
        else {
            converter = require(moduleName);
        }
        if (Array.isArray(converter)) {
            for (const item of converter) {
                yield item;
            }
        }
        else {
            yield converter;
        }
    }
}
function removeNullPropertiesFromObject(obj) {
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        }
        else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value);
        }
    }
}
function toNetworkAddressHex(value) {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}
// eslint-disable-next-line
function toSnakeCase(value) {
    if (typeof value === 'object') {
        value = { ...value };
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    }
    else {
        return value.replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase()).replace(/^_/, '').replace('_i_d', '_id');
    }
}
function validateFriendlyName(name, throwFirstError = false) {
    const errors = [];
    for (const endpointName of endpointNames) {
        if (name.toLowerCase().endsWith('/' + endpointName)) {
            errors.push(`friendly_name is not allowed to end with: '/${endpointName}'`);
        }
    }
    if (name.length === 0)
        errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/'))
        errors.push(`friendly_name is not allowed to end or start with /`);
    if (name.endsWith(String.fromCharCode(0)))
        errors.push(`friendly_name is not allowed to contain null char`);
    if (endpointNames.includes(name))
        errors.push(`Following friendly_name are not allowed: '${endpointNames}'`);
    if (name.match(/.*\/\d*$/))
        errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }
    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }
    return errors;
}
function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
function sanitizeImageParameter(parameter) {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}
function isAvailabilityEnabledForDevice(device, settings) {
    if (device.settings.hasOwnProperty('availability')) {
        return !!device.settings.availability;
    }
    // availability_timeout = deprecated
    const enabledGlobal = settings.advanced.availability_timeout || settings.availability;
    if (!enabledGlobal)
        return false;
    const passlist = settings.advanced.availability_passlist.concat(settings.advanced.availability_whitelist);
    if (passlist.length > 0) {
        return passlist.includes(device.name) || passlist.includes(device.ieeeAddr);
    }
    const blocklist = settings.advanced.availability_blacklist.concat(settings.advanced.availability_blocklist);
    return !blocklist.includes(device.name) && !blocklist.includes(device.ieeeAddr);
}
const entityIDRegex = new RegExp(`^(.+?)(?:/(${endpointNames.join('|')}|\\d+))?$`);
function parseEntityID(ID) {
    const match = ID.match(entityIDRegex);
    return match && { ID: match[1], endpoint: match[2] };
}
function isEndpoint(obj) {
    return obj.constructor.name.toLowerCase() === 'endpoint';
}
function isZHGroup(obj) {
    return obj.constructor.name.toLowerCase() === 'group';
}
const hours = (hours) => 1000 * 60 * 60 * hours;
const minutes = (minutes) => 1000 * 60 * minutes;
const seconds = (seconds) => 1000 * seconds;
exports.default = {
    endpointNames, capitalize, getZigbee2MQTTVersion, getDependencyVersion, formatDate, objectHasProperties,
    equalsPartial, getObjectProperty, getResponse, parseJSON, loadModuleFromText, loadModuleFromFile,
    getExternalConvertersDefinitions, removeNullPropertiesFromObject, toNetworkAddressHex, toSnakeCase,
    parseEntityID, isEndpoint, isZHGroup, hours, minutes, seconds, validateFriendlyName, sleep,
    sanitizeImageParameter, isAvailabilityEnabledForDevice,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw4REFBeUM7QUFDekMsMEVBQWlEO0FBQ2pELGtEQUEwQjtBQUMxQiw0Q0FBb0I7QUFDcEIsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUV4QiwwREFBMEQ7QUFDMUQsV0FBVztBQUNYLGtEQUFrRDtBQUNsRCx5RUFBeUU7QUFDekUsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFVO0lBQ2hDLE1BQU0sUUFBUSxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDM0MsTUFBTSxXQUFXLEdBQUcsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDOUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRTtRQUNoQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2QyxPQUFPLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDekMsQ0FBQyxDQUFDO0lBRUYsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFO1FBQ3JCLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM5QixHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6QixHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMxQixHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUM1QixH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