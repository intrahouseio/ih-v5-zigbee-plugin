class MqttMock {
  constructor(eventBus) {
    this.publishedTopics = new Set();
    this.subscriptions = new Map();
    this.eventBus = eventBus;
    this.retainedMessages = {};
    this.connected = false;
    this.defaultPublishOptions = {
      clientOptions: {},
      baseTopic: 'zigbee2mqtt',
      skipLog: false,
      skipReceive: true,
      meta: {},
    };
  }

  get info() {
    return { version: 5, server: "mock://mqtt" };
  }

  get stats() {
    return { connected: this.isConnected(), queued: 0 };
  }

  async connect() {
    this.connected = true;
    await this.onConnect();
  }

  async disconnect() {
    const stateData = { state: "offline" };
    await this.publish("bridge/state", JSON.stringify(stateData), { clientOptions: { retain: true } });
    this.connected = false;
  }

  async subscribe(topic) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
  }

  async unsubscribe(topic) {
    this.subscriptions.delete(topic);
  }

  async onConnect() {
    const stateData = { state: "online" };
    await this.publish("bridge/state", JSON.stringify(stateData), { clientOptions: { retain: true, qos: 1 } });
    await this.subscribe(`${this.defaultPublishOptions.baseTopic}/#`);
  }

  onMessage(topic, message) {
    if (!this.publishedTopics.has(topic)) {
      this.eventBus.emitMQTTMessage({ topic, message: message.toString() });
    }
  }

  isConnected() {
    return this.connected;
  }

  async publish(topic, payload, options = {}) {
    this.__publish(topic, payload, options)

    if (topic.includes("+") || topic.includes("#")) {
      return;
    }

    const finalOptions = { ...this.defaultPublishOptions, ...options };
    topic = `${finalOptions.baseTopic}/${topic}`;

    if (finalOptions.skipReceive) {
      this.publishedTopics.add(topic);
    }

    if (finalOptions.clientOptions.retain) {
      if (payload) {
        this.retainedMessages[topic] = {
          payload,
          options: finalOptions,
          topic: topic.substring(finalOptions.baseTopic.length + 1)
        };
      } else {
        delete this.retainedMessages[topic];
      }
    }

    this.eventBus.emitMQTTMessagePublished({ topic, payload, options: finalOptions });

    // Эмулируем доставку сообщения подписчикам
    for (const [sub, handlers] of this.subscriptions) {
      if (this.topicMatches(sub, topic)) {
        handlers.forEach((fn) => fn(topic, Buffer.from(payload)));
      }
    }

    // Эмулируем loopback
    if (!finalOptions.skipReceive) {
      this.onMessage(topic, Buffer.from(payload));
    }
  }

  topicMatches(sub, topic) {
    if (sub === topic) return true;
    if (sub.endsWith("/#") && topic.startsWith(sub.slice(0, -2))) return true;
    return false;
  }

  setHooks(_publish) {
    this.__publish = _publish
  }
}

module.exports = MqttMock