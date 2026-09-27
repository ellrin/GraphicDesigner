# 字型與授權

**本 repo 不包含任何字型檔。** 所有字型都是在使用者開啟網頁時，才由瀏覽器從 [Google Fonts](https://fonts.google.com/) 下載。repo 裡只有字型名稱清單（`src/config/fonts/*.json`）。`.gitignore` 會擋下所有字型檔（`.ttf`、`.otf`、`.woff`…），避免不小心 commit 到別人的字型。

清單中的字型皆採用 [SIL Open Font License 1.1（OFL）](https://openfontlicense.org/)：

- ✅ 可免費用於個人與商業設計（海報、名片、印刷品、網頁…）
- ✅ 可嵌入 PDF 等文件
- ❌ 不可單獨販售字型檔本身

字型著作權屬於各自的設計者，詳見各字型的 Google Fonts 頁面。

## 中文（繁體）

| 字型 | 名稱 | 分類 | 設計者 |
|---|---|---|---|
| Noto Sans TC | 思源黑體 | 黑體 | Google / Adobe |
| Noto Sans HK | 思源黑體 HK | 黑體 | Google / Adobe |
| Chiron Hei HK | 昭源黑體 | 黑體 | Tamcy |
| Chocolate Classical Sans | 朱古力黑體 | 黑體 | Tian Haidong |
| Noto Serif TC | 思源宋體 | 明體 | Google / Adobe |
| Noto Serif HK | 思源宋體 HK | 明體 | Google / Adobe |
| Chiron Sung HK | 昭源宋體 | 明體 | Tamcy |
| Cactus Classical Serif | 仙人掌明體 | 明體 | Tian Haidong |
| LXGW WenKai TC | 霞鶩文楷 | 楷體 | LXGW |
| UoqMunThenKhung | — | 楷體 | Moonlit Owen |
| Chiron GoRound TC | 昭源圓體 | 圓體 | Tamcy |
| Huninn | jf 粉圓 | 圓體 | justfont |
| Iansui | 芫荽 | 手寫 | But Ko |
| LXGW Marker Gothic | 霞鶩漫黑 | 標題 | LXGW |
| WDXL Lubrifont TC | — | 標題 | NightFurySL2001 |
| LXGW WenKai Mono TC | 霞鶩文楷 等寬 | 等寬 | LXGW |
| Bpmf Huninn | jf 粉圓（附注音） | 注音 | justfont |
| Bpmf Iansui | 芫荽（附注音） | 注音 | But Ko |
| Bpmf Zihi Kai Std | Zihi 楷體（附注音） | 注音 | But Ko |

## English

Sans：Inter、Roboto、Open Sans、Lato、Montserrat、Poppins、Work Sans、DM Sans、Manrope、Space Grotesk、Raleway
Serif：Playfair Display、Lora、Merriweather、EB Garamond、Cormorant Garamond、Libre Baskerville、DM Serif Display、Fraunces
Display：Bebas Neue、Oswald、Anton、Archivo Black、Abril Fatface、Syne、Unbounded
Script：Pacifico、Dancing Script、Great Vibes、Caveat
Mono：JetBrains Mono、Space Mono

## 注意事項

- **離線使用**時無法下載字型，會改用系統字型顯示。
- **新增字型**：在 `src/config/fonts/zh-tc.json` 或 `en.json` 加一筆資料即可。請只加入授權允許商用的字型，並把字型補進本檔的清單。
