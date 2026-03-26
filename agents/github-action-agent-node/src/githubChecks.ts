import { annotatedToConflictFile } from "@mergetonic/core";

import { conflictRegionToHeadSpanResult } from "./headLineMap";

import { githubRequestJson } from "./githubApi";

import type { MergeArtifactJson } from "./mergeReport";



type HydratePair = { leftLines: string[]; rightLines: string[] };



export async function postTonicCheck(

  owner: string,

  repo: string,

  headSha: string,

  token: string,

  artifacts: MergeArtifactJson[],

  pairs: Record<string, HydratePair>,

): Promise<void> {

  const apiRoot = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

  const annotations: Array<{

    path: string;

    start_line: number;

    end_line: number;

    annotation_level: string;

    message: string;

  }> = [];

  let conflictFiles = 0;

  const fileUnmapped: Record<string, number> = {};

  const fileAmbiguous: Record<string, number> = {};



  for (const a of artifacts) {

    if (!a.markers_present) {

      continue;

    }

    conflictFiles += 1;

    const path = a.path;

    const rightLines = pairs[path]?.rightLines ?? [];

    const cf = annotatedToConflictFile(path, a.annotated_lines ?? []);

    let preferAfter = 0;

    for (const reg of cf.conflicts) {

      const res = conflictRegionToHeadSpanResult(reg, rightLines, preferAfter);

      if (res.kind === "unique") {

        preferAfter = res.span[1];

        const [hStart, hEnd] = res.span;

        if (annotations.length < 50) {

          annotations.push({

            path,

            start_line: hStart,

            end_line: hEnd,

            annotation_level: "warning",

            message: `Tonic conflict (${reg.conflictKind}) — inline review mapped`,

          });

        }

      } else if (res.kind === "ambiguous") {

        fileAmbiguous[path] = (fileAmbiguous[path] ?? 0) + 1;

      } else {

        fileUnmapped[path] = (fileUnmapped[path] ?? 0) + 1;

      }

    }

  }



  for (const p of Object.keys({ ...fileUnmapped, ...fileAmbiguous })) {

    if (annotations.length >= 50) {

      break;

    }

    const u = fileUnmapped[p] ?? 0;

    const amb = fileAmbiguous[p] ?? 0;

    if (u === 0 && amb === 0) {

      continue;

    }

    const parts: string[] = [];

    if (amb) {

      parts.push(`${amb} ambiguous head span(s)`);

    }

    if (u) {

      parts.push(`${u} unmapped region(s)`);

    }

    annotations.push({

      path: p,

      start_line: 1,

      end_line: 1,

      annotation_level: "notice",

      message: `Tonic: ${parts.join("; ")} — see PR issue / marker branch for full markers`,

    });

  }



  const conclusion = conflictFiles ? "neutral" : "success";

  const summary = `${conflictFiles} file(s) with Tonic conflict markers. ${annotations.length} annotation(s) (capped at 50).`;

  await githubRequestJson("POST", `${apiRoot}/repos/${owner}/${repo}/check-runs`, token, {

    name: "Tonic merge",

    head_sha: headSha,

    status: "completed",

    conclusion,

    output: {

      title: "Tonic pairwise merge",

      summary,

      annotations: annotations.slice(0, 50),

    },

  });

}

