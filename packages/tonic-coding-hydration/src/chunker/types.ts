export type AstGrepChunk = {
  path: string;
  start_line: number;
  end_line: number;
  text: string;
  ast_rule_id?: string;
  ast_match_id?: string;
  symbol?: string;
};
