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
const logger_1 = __importDefault(require("./util/logger"));
const data_1 = __importDefault(require("./util/data"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const fs_1 = __importDefault(require("fs"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const saveInterval = 1000 * 60 * 5; // 5 minutes
const dontCacheProperties = [
    'action', 'action_.*', 'button', 'button_left', 'button_right', 'click', 'forgotten', 'keyerror',
    'step_size', 'transition_time', 'group_list', 'group_capacity', 'no_occupancy_since',
    'step_mode', 'transition_time', 'duration', 'elapsed', 'from_side', 'to_side',
];
class State {
    constructor(eventBus, zigbee) {
        this.eventBus = eventBus;
        this.zigbee = zigbee;
        this.state = {};
        this.file = data_1.default.joinPath('state.json');
        this.timer = null;
        this.eventBus = eventBus;
        this.zigbee = zigbee;
    }
    start() {
        this.load();
        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
    }
    stop() {
        // Remove any invalid states (ie when the device has left the network) when the system is stopped
        Object.keys(this.state)
            .filter((k) => typeof k === 'string' && !this.zigbee.resolveEntity(k)) // string key = ieeeAddr
            .forEach((k) => delete this.state[k]);
        clearTimeout(this.timer);
        this.save();
    }
    load() {
        if (fs_1.default.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs_1.default.readFileSync(this.file, 'utf8'));
                logger_1.default.debug(`Loaded state from file ${this.file}`);
            }
            catch (e) {
                logger_1.default.debug(`Failed to load state from file ${this.file} (corrupt file?)`);
            }
        }
        else {
            logger_1.default.debug(`Can't load state from file ${this.file} (doesn't exist)`);
        }
    }
    save() {
        if (settings.get().advanced.cache_state_persistent) {
            logger_1.default.debug(`Saving state to file ${this.file}`);
            const json = JSON.stringify(this.state, null, 4);
            try {
                fs_1.default.writeFileSync(this.file, json, 'utf8');
            }
            catch (e) {
                logger_1.default.error(`Failed to write state to '${this.file}' (${e.message})`);
            }
        }
        else {
            logger_1.default.debug(`Not saving state`);
        }
    }
    exists(entity) {
        return this.state.hasOwnProperty(entity.ID);
    }
    get(entity) {
        return this.state[entity.ID] || {};
    }
    set(entity, update, reason = null) {
        const fromState = this.state[entity.ID] || {};
        const toState = (0, object_assign_deep_1.default)({}, fromState, update);
        const newCache = { ...toState };
        const entityDontCacheProperties = entity.options.filtered_cache || [];
        utils_1.default.filterProperties(dontCacheProperties.concat(entityDontCacheProperties), newCache);
        this.state[entity.ID] = newCache;
        this.eventBus.emitStateChange({ entity, from: fromState, to: toState, reason, update });
        return toState;
    }
    remove(ID) {
        delete this.state[ID];
    }
}
exports.default = State;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvc3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJEQUFtQztBQUNuQyx1REFBK0I7QUFDL0IsMERBQTRDO0FBQzVDLHlEQUFpQztBQUNqQyw0Q0FBb0I7QUFDcEIsNEVBQWtEO0FBRWxELE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWTtBQUVoRCxNQUFNLG1CQUFtQixHQUFHO0lBQ3hCLFFBQVEsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxVQUFVO0lBQ2hHLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsZ0JBQWdCLEVBQUUsb0JBQW9CO0lBQ3BGLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxTQUFTO0NBQ2hGLENBQUM7QUFFRixNQUFNLEtBQUs7SUFLUCxZQUE2QixRQUFrQixFQUFtQixNQUFjO1FBQW5ELGFBQVEsR0FBUixRQUFRLENBQVU7UUFBbUIsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUp4RSxVQUFLLEdBQXFDLEVBQUUsQ0FBQztRQUM3QyxTQUFJLEdBQUcsY0FBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuQyxVQUFLLEdBQWlCLElBQUksQ0FBQztRQUcvQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBRUQsS0FBSztRQUNELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVaLG1DQUFtQztRQUNuQyxJQUFJLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFB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