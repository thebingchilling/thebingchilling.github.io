/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { defaultOptions } from './meta.js';
import { initEmscriptenModule } from './utils.js';
// Upstream picks between a SIMD and non-SIMD encoder build via the
// `wasm-feature-detect` package. That's one more thing to vendor for a
// speed optimization we don't need here (lossless PNG->WebP conversions
// are infrequent, one-shot operations), so this always loads the plain
// build at `enc/webp_enc.js`.
let emscriptenModule;
export async function init(module, moduleOptionOverrides) {
    let actualModule = module;
    let actualOptions = moduleOptionOverrides;
    // If only one argument is provided and it's not a WebAssembly.Module
    if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
        actualModule = undefined;
        actualOptions = module;
    }
    const webpEncoder = await import('./enc/webp_enc.js');
    emscriptenModule = initEmscriptenModule(webpEncoder.default, actualModule, actualOptions);
    return emscriptenModule;
}
export default async function encode(data, options = {}) {
    if (!emscriptenModule)
        emscriptenModule = init();
    const _options = { ...defaultOptions, ...options };
    const module = await emscriptenModule;
    const result = module.encode(data.data, data.width, data.height, _options);
    if (!result)
        throw new Error('Encoding error.');
    return result.buffer;
}
