import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "design-system";

// Real usage (company detail page): CardHeader holds a label + a large
// salary figure, no CardTitle/CardDescription/CardFooter/CardAction —
// this app builds its own heading markup inside CardHeader instead.
export function InContext() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">
            平均年収（有価証券報告書・単体）
          </span>
          <Badge variant="secondary">推定</Badge>
        </div>
        <p className="text-4xl font-bold">1,642万円</p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">全体順位</dt>
            <dd className="font-medium">3位 / 1,867社</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">業界内順位</dt>
            <dd className="font-medium">1位 / 42社</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// CardTitle/CardDescription/CardFooter/CardAction aren't used anywhere in
// this app yet, but they're part of the primitive's API — shown together
// here so their styling is visible.
export function FullComposition() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>キーエンス</CardTitle>
        <CardDescription>電気機器</CardDescription>
        <CardAction>
          <Badge variant="outline">本社のみ</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          35歳時点の推定年収 <span className="font-bold text-foreground">788万円</span>
        </p>
      </CardContent>
      <CardFooter>
        <span className="text-xs text-muted-foreground">従業員数 4,013人</span>
      </CardFooter>
    </Card>
  );
}
