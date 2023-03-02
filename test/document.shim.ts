// eslint-disable-next-line import/no-mutable-exports
let documentShim: any;

try {
  documentShim = document || {
    head: {
      appendChild: () => false,
    },
    createElement: () => ({
      src: false,
      contentWindow: {
        postMessage: () => false,
      },
    }),
    addEventListener: () => false,
  };
} catch (e) {
  documentShim = {
    head: {
      appendChild: () => false,
    },
    createElement: () => ({
      src: false,
      contentWindow: {
        postMessage: () => false,
      },
    }),
    addEventListener: () => false,
  };
}

export default documentShim;
