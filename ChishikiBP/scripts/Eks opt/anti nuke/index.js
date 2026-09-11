import { system } from "../../core.js";
let lastTick = NaN;
const callbacks = [];
let tickRunId;

function ensureInterval() {
	if (callbacks.length === 0) {
		if (tickRunId !== undefined) {
			system.clearRun(tickRunId);
			tickRunId = undefined;
		}
		return;
	}
	if (tickRunId !== undefined) return;
	tickRunId = system.runInterval(() => {
		if (!callbacks.length) {
			ensureInterval();
			return;
		}
		const { currentTick } = system;
		const deltaTime = (Date.now() - lastTick) / 1000;
		lastTick = Date.now();
		for (const callback of callbacks) {
			try { callback({ deltaTime, currentTick }); } catch {}
		}
	}, 20);
}

export class TickEventSignal {
	subscribe(callback) {
		callbacks.push(callback);
		ensureInterval();
		return callback;
	}
	unsubscribe(callback) {
		const index = callbacks.indexOf(callback);
		if (index >= 0) callbacks.splice(index, 1);
		ensureInterval();
	}
}
export const tick = new TickEventSignal();
