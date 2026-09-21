# Attribution

The CWT extension is derived from **CWops CWT by Sebastian Delmont, KI2D**, the
main Ham2K developer. The original CWT source is copyright © 2026 Sebastian
Delmont <sd@ham2k.com>, licensed under the Mozilla Public License 2.0. Its
copyright and SPDX notices are retained in the adapted source files.

Changes for N1RWJ add contest call-history data, previous-contact suggestions,
MST and SST extensions, an RBN reception panel, shared N1MM and operation-history
adapters, tests, and independent packaging. These are independent extensions;
Ham2K and Sebastian Delmont do not maintain or endorse them.

The adapted source is distributed under MPL-2.0; see [LICENSE](LICENSE).
Source and build instructions are available at
[ham2k-n1rwj-extensions](https://github.com/rwjblue/ham2k-n1rwj-extensions).
See [provenance](https://github.com/rwjblue/ham2k-n1rwj-extensions/blob/main/docs/PROVENANCE.md)
for exact upstream sources and the original archive checksum.

The RBN extension also bundles Natural Earth map data and projection libraries.
See its [map attribution](https://github.com/rwjblue/ham2k-n1rwj-extensions/blob/main/extensions/tools/n1rwj-rbn/assets/MAP_ATTRIBUTION.md)
for sources and licenses. The RBN bundle includes that attribution and the
corresponding library notices under `assets/`.

The bundles include portions of the published `@ham2k/extension-sdk`;
CWT also includes prefill improvements backported from Ham2K/extensions
PR #1. The SDK and build tools are separately licensed under MIT. Retained
MIT notices follow:

Copyright (c) 2026 Sebastian Delmont <sd@ham2k.com>
Copyright (c) 2026 Robert Jackson (N1RWJ)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
