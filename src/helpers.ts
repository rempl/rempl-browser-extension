export function createIndicator() {
    const debugIndicator = document.createElement('div');

    debugIndicator.setAttribute(
        'style',
        'position:fixed;top:10px;left:10px;background:red;width:20px;height:20px;border-radius:50%'
    );
    document.body.append(debugIndicator);

    return debugIndicator;
}

export function genUID(len = 16) {
    function base36(val: number) {
        return Math.round(val).toString(36);
    }

    // uid should starts with alpha
    let result = base36(10 + 25 * Math.random());

    while (result.length < len) {
        result += base36(Date.now() * Math.random());
    }

    return result.substr(0, len);
}
