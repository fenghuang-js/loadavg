const EventEmitter = require("events");

const moment = require("moment");

module.exports = class LoadAverage extends EventEmitter {
    static get DEFAULT_OPTIONS() {
        return {
            reportingInterval: 60 * 1000,
            averageBuckets: [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]
        };
    }

    constructor(options = {}) {
        super();

        this._options = {
            ...LoadAverage.DEFAULT_OPTIONS,
            ...options
        };

        this._options.averageBuckets = this._options.averageBuckets.sort((a,b) => a - b);
        if (!this._options.baseAveragingInterval) {
            this._options.baseAveragingInterval = this._options.averageBuckets[0];
        }
        for (const bucket of this._options.averageBuckets) {
            if (bucket % this._options.baseAveragingInterval) {
                throw new Error("All average buckets must be an integer multiple of the base averaging interval");
            }
        }

        this._cpsBuckets = this._options.averageBuckets.map((averageBucket) => ({
            baseFrequencyMultiplier: averageBucket / this._options.baseAveragingInterval,
            bucket: averageBucket,
            averages: []
        }));

        this._reportHandler = this.report.bind(this);

        this.on("report", this._reportHandler);
        this.on("newListener", () => this.removeListener("report", this._reportHandler));

        this._count = 0;
        this._lastCountTime = process.hrtime.bigint();

        this._averagingTimer = setInterval(() => this._averagingTick(), this._options.baseAveragingInterval);
        this._reportingTimer = setInterval(() => this._reportingTick(), this._options.reportingInterval);
        this._avergingTimer.unref();
        this._reportingTimer.unref();
    }

    count(multiplier = 1) {
        this._count += multiplier;
    }

    _reportingTick() {
        const results = this._cpsBuckets.map((cpsBucket) => {
            const validAverages = cpsBucket.averages.slice(0, cpsBucket.baseFrequencyMultiplier);
            if (!validAverages.length) {
                return {
                    cps: 0,
                    bucket: cpsBucket.bucket
                };
            }

            return {
                cps: validAverages.reduce((sum, cps) => sum + cps, 0) / validAverages.length,
                bucket: cpsBucket.bucket
            };
        });

        this.emit("report", results, this._options.topic);
    }

    _averagingTick() {
        const now = process.hrtime.bigint();
        const elapsed = Number(now - this._lastCountTime) / 1000000000;
        this._lastCountTime = now;
        const cps = this._count / elapsed;
        this._count = 0;

        for (const cpsBucket of this._cpsBuckets) {
            cpsBucket.averages.unshift(cps);
            cpsBucket.averages.splice(cpsBucket.baseFrequencyMultiplier);
        }
    }

    report(data, topic) {
        const topicSuffix = topic ? ` for topic ${topic}` : "";

        for (const bucket of data) {
            console.log(`${moment.duration(bucket.bucket).humanize()} average CPS${topicSuffix}: ${bucket.cps}`);
        }
    }
};
