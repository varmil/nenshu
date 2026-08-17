import { RankingApp } from "@/features/ranking/components/RankingApp";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import companiesData from "../public/data/companies.json";
import curvesData from "../public/data/curves.json";

export default function Home() {
  return (
    <RankingApp
      companies={companiesData as CompaniesData}
      curves={curvesData as CurvesData}
    />
  );
}
