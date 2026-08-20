import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "design-system";

// Real usage (ranking table): rank + company name + industry + an
// estimated-salary column carrying a "推定" badge in its own header cell.
export function InContext() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">順位</TableHead>
          <TableHead>会社名</TableHead>
          <TableHead>業種</TableHead>
          <TableHead>
            <span className="flex items-center gap-1.5">
              35歳時点の推定年収
              <Badge variant="secondary">推定</Badge>
            </span>
          </TableHead>
          <TableHead>従業員数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="text-muted-foreground">1</TableCell>
          <TableCell>キーエンス</TableCell>
          <TableCell>電気機器</TableCell>
          <TableCell>788万円</TableCell>
          <TableCell>4,013人</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">2</TableCell>
          <TableCell>三菱商事</TableCell>
          <TableCell>卸売業</TableCell>
          <TableCell>612万円</TableCell>
          <TableCell>5,631人</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
