import { Progress } from "@mantine/core";
import { FC } from "react";

interface CusProgressBarModel {
  value: number;
  min: number;
  max: number;
}

export const CusProgressBar: FC<CusProgressBarModel> = ({ value, min, max }) => {
  const minValue = min; // 原始范围的最小值
  const maxValue = max; // 原始范围的最大值
  const minMappedValue = 0; // 映射后范围的最小值
  const maxMappedValue = 100; // 映射后范围的最大值

  const mappedValue =
    ((value - minValue) / (maxValue - minValue)) *
      (maxMappedValue - minMappedValue) +
    minMappedValue;
  return <Progress value={mappedValue} />;
};
