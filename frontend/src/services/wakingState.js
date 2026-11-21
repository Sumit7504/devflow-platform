const listeners = new Set();

let state = {
  isWaking: false,
  message: "The server may be waking up, this can take up to a minute",
  retryHandler: null,
};

export const subscribeWakingState = (listener) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

export const setWakingState = (update) => {
  state = { ...state, ...update };
  listeners.forEach((fn) => fn(state));
};

export const clearWakingState = () => {
  if (state.isWaking) {
    state = {
      isWaking: false,
      message: "The server may be waking up, this can take up to a minute",
      retryHandler: null,
    };
    listeners.forEach((fn) => fn(state));
  }
};
