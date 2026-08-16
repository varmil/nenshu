import { Button } from "@/design-system/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">年齢補正年収ランキング</h1>
      <p className="text-muted-foreground mx-auto max-w-md text-sm">
        プロジェクト基盤（U1）の疎通確認用ページ。ランキング本体は U2 以降で実装する。
      </p>
      <Button className="mx-auto">デザインシステム疎通確認</Button>
    </main>
  );
}
