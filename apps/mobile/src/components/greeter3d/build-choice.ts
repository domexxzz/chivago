/**
 * Which of ChangChang's two builds a machine is sent - the decision, with no
 * browser in it, so a test can hold it.
 *
 * The small build carries colour on its vertices only, and on every real
 * screen it shows: the printed coat breaks into blotches and the eyes lose
 * their pupils (an iPad and an iPhone, 15 November 2026). The detailed build
 * used to cost 7.8 MB, which is why phones were spared it. Quantised and
 * meshopt-compressed it is 3.2 MB (2.9 MB on the wire) - one photograph's
 * worth - so everybody gets the build with eyes.
 *
 * Except somebody who asked their browser to spend less. They have asked us
 * too, and the small build is still a recognisable ChangChang.
 */

export interface Machine {
  saveData: boolean;
}

export function wantsDetailedBuild(m: Machine): boolean {
  return !m.saveData;
}
