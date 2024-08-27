// eslint-disable-next-line import/no-mutable-exports
let documentShim: any;

const shim = {
  head: {
    appendChild: (child: { onload?: () => void }) => {
      child.onload?.();
    },
  },
  createElement: () => ({
    src: false,
    contentWindow: {
      postMessage: () => false,
    },
  }),
  addEventListener: () => false,
};

try {
  documentShim = document || shim;
} catch (error) {
  documentShim = shim;
}

export default documentShim;
