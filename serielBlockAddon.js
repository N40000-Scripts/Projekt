class SerialExtension {
    constructor(runtime) {
        this.runtime = runtime;
        this.port = null;
        this.readable = null;
        this.writable = null;
        this.reader = null;
        this.writer = null;
        this.textDecoder = new TextDecoderStream();
        this.textEncoder = new TextEncoder();
        this._lastReceivedData = '';
        this.onDataCallback = null;
        this.keepReading = false;
        this.storageKey = 'serialPortInfo';
    }

    getInfo() {
        return {
            id: 'serialExt',
            name: 'Serielle Schnittstelle',
            blocks: [
                {
                    opcode: 'connect',
                    blockType: 'command',
                    text: 'verbinde mit serieller Schnittstelle',
                },
                {
                    opcode: 'sendText',
                    blockType: 'command',
                    text: 'sende Text [TEXT]',
                    arguments: {
                        TEXT: {
                            type: 'string',
                            defaultValue: 'Hallo'
                        }
                    }
                },
                {
                    opcode: 'sendNumber',
                    blockType: 'command',
                    text: 'sende Zahl [NUMBER]',
                    arguments: {
                        NUMBER: {
                            type: 'number',
                            defaultValue: 123
                        }
                    }
                },
                {
                    opcode: 'onReceive',
                    blockType: 'hat',
                    text: 'bei seriellen Daten empfangen'
                },
                {
                    opcode: 'getReceivedData',
                    blockType: 'reporter',
                    text: 'empfangene serielle Daten'
                },
                {
                    opcode: 'disconnect',
                    blockType: 'command',
                    text: 'schließe serielle Schnittstelle'
                },
                {
                    opcode: 'autoConnect',
                    blockType: 'command',
                    text: 'automatisch mit vorherigem Port verbinden'
                }
            ]
        };
    }

    async connect() {
        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            this.readable = this.port.readable.pipeThrough(this.textDecoder);
            this.reader = this.readable.getReader();
            this.writable = this.port.writable;
            this.writer = this.writable.getWriter();
            this.keepReading = true;
            this.readLoop();
            // Port info speichern für automatische Verbindung
            localStorage.setItem(this.storageKey, this.getPortInfo(this.port));
            console.log('Serielle Schnittstelle verbunden');
        } catch (error) {
            console.error('Serielle Verbindung fehlgeschlagen', error);
        }
    }

    async autoConnect() {
        try {
            const savedPortInfo = localStorage.getItem(this.storageKey);
            if (!savedPortInfo) {
                console.warn('Kein gespeicherter Port gefunden');
                return;
            }
            const ports = await navigator.serial.getPorts();
            this.port = ports.find(port => this.getPortInfo(port) === savedPortInfo);
            if (!this.port) {
                console.warn('Gespeicherter Port nicht gefunden');
                return;
            }
            await this.port.open({ baudRate: 115200 });
            this.readable = this.port.readable.pipeThrough(this.textDecoder);
            this.reader = this.readable.getReader();
            this.writable = this.port.writable;
            this.writer = this.writable.getWriter();
            this.keepReading = true;
            this.readLoop();
            console.log('Automatisch mit gespeichertem Port verbunden');
        } catch (error) {
            console.error('Automatische Verbindung fehlgeschlagen', error);
        }
    }

    getPortInfo(port) {
        const info = port.getInfo();
        return `${info.usbVendorId || 'unk'}:${info.usbProductId || 'unk'}`;
    }

    async disconnect() {
    this.keepReading = false;

    if (this.reader) {
        try {
            await this.reader.cancel();
        } catch(e) {
            // Reader eventuell schon freigegeben, Fehler ignorieren
        }
        try {
            this.reader.releaseLock();
        } catch(e) {
            // Reader ggf. schon freigegeben
        }
        this.reader = null;
    }

    if (this.writer) {
        try {
            await this.writer.close();
        } catch(e) {
            // Writer ggf. schon geschlossen
        }
        try {
            this.writer.releaseLock();
        } catch(e) {
            // Writer ggf. schon freigegeben
        }
        this.writer = null;
    }

    if (this.port) {
        try {
            await this.port.close();
        } catch(e) {
            // Port ggf. schon geschlossen
        }
        this.port = null;
    }

    this._lastReceivedData = '';
    console.log('Serielle Schnittstelle geschlossen');
}

    async readLoop() {
        while (this.keepReading && this.reader) {
            try {
                const { value, done } = await this.reader.read();
                if (done) {
                    this.reader.releaseLock();
                    break;
                }
                if (value) {
                    this._lastReceivedData = value;
                    if (this.onDataCallback) {
                        this.onDataCallback();
                    }
                }
            } catch (error) {
                console.error('Fehler beim Lesen serieller Daten', error);
                break;
            }
        }
    }

    async sendText(args) {
        if (!this.writer) return;
        const data = this.textEncoder.encode(args.TEXT);
        await this.writer.write(data);
    }

    async sendNumber(args) {
        if (!this.writer) return;
        let buffer = new ArrayBuffer(4);
        new DataView(buffer).setFloat32(0, args.NUMBER, true);
        await this.writer.write(buffer);
    }

    onReceive() {
        return !!this._lastReceivedData;
    }

    getReceivedData() {
        const data = this._lastReceivedData;
        this._lastReceivedData = ''; // Nach dem Lesen zurücksetzen
        return data || '';
    }

    setOnDataCallback(callback) {
        this.onDataCallback = callback;
    }
}

(function() {
    if (typeof window === 'undefined' || !window.vm) return;
    const extensionInstance = new SerialExtension(window.vm.runtime);
    window.vm.extensionManager._registerInternalExtension(extensionInstance);
})();
