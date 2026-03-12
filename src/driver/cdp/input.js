/**
 * @license
 * Copyright 2017 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { _keyDefinitions, } from './us-keyboard-layout';
import { assert } from '../utils';
/**
 * @internal
 */
export class CdpKeyboard {
    #pressedKeys = new Set();
    #client;
    _modifiers = 0;
    constructor(client) {
        this.#client = client;
    }
    updateClient(client) {
        this.#client = client;
    }
    async down(key, options = {
        text: undefined,
        commands: [],
    }) {
        const description = this.#keyDescriptionForString(key);
        const autoRepeat = this.#pressedKeys.has(description.code);
        this.#pressedKeys.add(description.code);
        this._modifiers |= this.#modifierBit(description.key);
        const text = options.text === undefined ? description.text : options.text;
        await this.#client.send('Input.dispatchKeyEvent', {
            type: text ? 'keyDown' : 'rawKeyDown',
            modifiers: this._modifiers,
            windowsVirtualKeyCode: description.keyCode,
            code: description.code,
            key: description.key,
            text: text,
            unmodifiedText: text,
            autoRepeat,
            location: description.location,
            isKeypad: description.location === 3,
            commands: options.commands,
        });
    }
    #modifierBit(key) {
        if (key === 'Alt') {
            return 1;
        }
        if (key === 'Control') {
            return 2;
        }
        if (key === 'Meta') {
            return 4;
        }
        if (key === 'Shift') {
            return 8;
        }
        return 0;
    }
    #keyDescriptionForString(keyString) {
        const shift = this._modifiers & 8;
        const description = {
            key: '',
            keyCode: 0,
            code: '',
            text: '',
            location: 0,
        };
        const definition = _keyDefinitions[keyString];
        assert(definition, `Unknown key: "${keyString}"`);
        if (definition.key) {
            description.key = definition.key;
        }
        if (shift && definition.shiftKey) {
            description.key = definition.shiftKey;
        }
        if (definition.keyCode) {
            description.keyCode = definition.keyCode;
        }
        if (shift && definition.shiftKeyCode) {
            description.keyCode = definition.shiftKeyCode;
        }
        if (definition.code) {
            description.code = definition.code;
        }
        if (definition.location) {
            description.location = definition.location;
        }
        if (description.key.length === 1) {
            description.text = description.key;
        }
        if (definition.text) {
            description.text = definition.text;
        }
        if (shift && definition.shiftText) {
            description.text = definition.shiftText;
        }
        // if any modifiers besides shift are pressed, no text should be sent
        if (this._modifiers & ~8) {
            description.text = '';
        }
        return description;
    }
    async up(key) {
        const description = this.#keyDescriptionForString(key);
        this._modifiers &= ~this.#modifierBit(description.key);
        this.#pressedKeys.delete(description.code);
        await this.#client.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            modifiers: this._modifiers,
            key: description.key,
            windowsVirtualKeyCode: description.keyCode,
            code: description.code,
            location: description.location,
        });
    }
    async sendCharacter(char) {
        await this.#client.send('Input.insertText', { text: char });
    }
    charIsKey(char) {
        return !!_keyDefinitions[char];
    }
    async type(text, options = {}) {
        const delay = options.delay || undefined;
        for (const char of text) {
            if (this.charIsKey(char)) {
                await this.press(char, { delay });
            }
            else {
                if (delay) {
                    await new Promise((f) => {
                        return setTimeout(f, delay);
                    });
                }
                await this.sendCharacter(char);
            }
        }
    }
    async press(key, options = {}) {
        const { delay = null } = options;
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) {
            await this.down(k, options);
        }
        if (delay) {
            await new Promise((f) => {
                return setTimeout(f, options.delay);
            });
        }
        for (const k of [...keys].reverse()) {
            await this.up(k);
        }
    }
}
