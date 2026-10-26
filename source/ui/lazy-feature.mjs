// One retained instance per feature. Cleanup never loads a feature; it also
// invalidates operations still waiting for its module when navigation/lock wins.
export function lazyFeature(load) {
  let instance, pending, generation = 0;
  const synchronous = new Set(['stop', 'stopListening', 'enforcePolicy', 'updateUniversalAlertBar']);
  return new Proxy({}, {get(_target, method) {
    if (synchronous.has(method)) return (...args) => {
      if (method === 'stop' || method === 'stopListening') generation++;
      return instance?.[method]?.(...args) ?? true;
    };
    return async (...args) => {
      const ticket = generation;
      pending ||= load().then(value => (instance = value)).catch(error => {pending = null; throw error;});
      const feature = await pending;
      if (ticket !== generation) return;
      return feature[method](...args);
    };
  }});
}
