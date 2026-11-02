import * as React from "react";

/** Small sentence-case group heading ("After Tomas", "Who's coming?"). */
export interface SectionLabelProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionLabel(props: SectionLabelProps): JSX.Element;
