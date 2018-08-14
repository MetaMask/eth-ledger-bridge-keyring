try {
    module.exports = document || {
        head: {
            appendChild: _ => false,
        },
        createElement: _ => ({
            src: false,
            contentWindow: {
                postMessage: _ => false,
            },
        }),
        addEventListener: _ => false,
    }
} catch (e) {
	module.exports = {
        head: {
            appendChild: _ => false,
        },
        createElement: _ => ({
            src: false,
            contentWindow: {
                postMessage: _ => false,
            },
        }),
        addEventListener: _ => false,
    }
}
