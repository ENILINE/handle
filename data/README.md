# 成语数据源

`idioms.jsonl` 是项目唯一需要人工维护的成语数据库。每行包含一个四字成语、数字声调拼音、解释、出处和示例；出处和示例允许为空。

记录顺序会参与评价基准词的固定抽样；不要只为格式美观而整体重排。运行时词表会由生成器自行排序。

不要直接修改以下派生文件：

- `src/data/idioms.txt`
- `src/data/polyphones.json`
- `src/data/idiom_index.json`
- `public/idiom-data/*.json`
- `src/eval/data.ts`

修改数据源后运行：

```bash
pnpm data:build
pnpm data:check
```

生成器会把与当前 `pinyin` 模块输出一致的成语写入 `idioms.txt`，只把读音不同的成语写入 `polyphones.json`。

新增、删除成语或修改拼音会改变评价语料。提交这类变化时应检查 `src/eval/data.ts` 的差异，并相应提升 `EVAL_VERSION`，使已有持久化评价失效。
