![](./public/og.png)

# 汉兜 Handle

A Chinese Hanzi variation of [Wordle](https://www.powerlanguage.co.uk/wordle/). 汉字 Wordle.

基于 [antfu/handle](https://github.com/antfu/handle) 修改, **TODO**. 原站点 [handle.antfu.me](https://handle.antfu.me). 参考了 [YuukaBot](https://bot.yunmengdu.cn/).

请勿剧透! PLEASE DO NOT SPOIL!

## Development Setup

- Insall [Node.js](https://nodejs.org/en/) >=v16 and [pnpm](https://pnpm.io/)
- Run `pnpm install`
- Run `pnpm dev` and visit `http://localhost:4444`

## 成语数据

项目唯一需要人工维护的成语数据库是 [data/idioms.jsonl](./data/idioms.jsonl)，其中包含成语、数字声调拼音、解释、出处和示例。

修改数据后运行：

```bash
pnpm data:build
pnpm data:check
```

`src/data/idioms.txt`、`src/data/polyphones.json`、`public/idiom-data/*.json`、`src/eval/data.ts` 和 `src/eval/corpus-version.ts` 均为生成文件，不应直接修改。详细说明见 [data/README.md](./data/README.md)。

## Tech Stack

- [Vue 3](https://v3.vuejs.org/)
- [Vite](https://vitejs.dev/)
- [VueUse](https://vueuse.org/)
- [UnoCSS](https://github.com/antfu/unocss)
- [Vitesse Lite](https://github.com/antfu/vitesse-lite)

## License

基于 [MIT](./LICENSE) 许可的原始作品 © 2021-PRESENT [Anthony Fu](https://github.com/antfu)。

修改部分 © 2026 [ENILINE](https://github.com/ENILINE)，同样采用 MIT 许可。
