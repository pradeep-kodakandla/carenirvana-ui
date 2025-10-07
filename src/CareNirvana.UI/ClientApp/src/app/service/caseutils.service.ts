export function camelizeKey(k: string): string {
  return k.length ? k[0].toLowerCase() + k.slice(1) : k;
}

export function camelize<T = any>(input: any): T {
  if (Array.isArray(input)) {
    return input.map(camelize) as any;
  }
  if (input && typeof input === 'object') {
    const out: any = {};
    Object.keys(input).forEach(k => {
      out[camelizeKey(k)] = camelize((input as any)[k]);
    });
    return out;
  }
  return input;
}

