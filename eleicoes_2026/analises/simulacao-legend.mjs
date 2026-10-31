// Keep legend highlighting local to its simulation or ensemble panel.
export function bindCandidateLegend(legend,onHighlight){
 const items=[...legend.querySelectorAll('[data-candidate]')];
 function highlight(candidate){
  legend.dataset.highlightedCandidate=candidate===null?'':String(candidate);
  onHighlight(candidate);
 }
 for(const item of items){
  const enter=()=>highlight(Number(item.dataset.candidate)),leave=()=>highlight(null);
  item.addEventListener('pointerenter',enter);item.addEventListener('pointerleave',leave);
  item.addEventListener('focus',enter);item.addEventListener('blur',leave);
 }
}
export function candidateOpacity(candidate,highlighted,opacity=1){
 return highlighted===null||highlighted===candidate?opacity:opacity*.4;
}
export function candidateColor(candidate,highlighted){
 return highlighted!==null&&highlighted!==candidate?'#9ea6a1':candidate?'#2166ac':'#d73027';
}
