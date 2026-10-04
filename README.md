# usage-band

Claude Code の入力欄の上に、使用量を帯で表示する mod（プラグイン）です。

- **5時間枠・週の使用率**：バーと % で表示。バー上の縦線は、枠の時間がどこまで進んだか
- **ペース**：使用率 ÷ 時間の経過率（`×1.0` でちょうど枠を使い切る速さ。`×1.5` なら上限に早く当たる）
- **リセット時刻**：日本時間
- **コンテキストウィンドウ**：使用量と、内訳（メッセージ・ツール・MCP・スキル）の色分けバー

デスクトップアプリ（Code タブ）では図で、ターミナルでは1行の文字で出ます。

数値は Claude Code 本体がセッションに渡す値をそのまま描いています。非公式の API には問い合わせません。

## 必要なもの

- 関数フック（mod）に対応した Claude Code。動作確認は 2.1.286

## 入れ方

ターミナルで次の2つを実行し、Claude Code を起動し直します。

```bash
claude plugin marketplace add tsumugilabo/usage-band
```

```bash
claude plugin install usage-band@usage-band
```

### Claude Code に入れてもらう場合

次の一文を Claude Code に渡してください。

```
https://github.com/tsumugilabo/usage-band の usage-band プラグインを入れて、入力欄の上に使用量の帯が出るまで設定して
```

## 外し方

```bash
claude plugin uninstall usage-band@usage-band
```

## 注意

- 配色はダークテーマ向けです
- 表示の文言は日本語、時刻は日本時間に固定です
- mod はまだ新しい仕組みで、Claude Code の更新で動かなくなることがあります

## ライセンス

MIT
