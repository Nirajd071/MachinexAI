import type { Tick } from '../types';
export function XaiPanel({ tick }: { tick?: Tick }) {
  const dg = tick?.diagnostics;
  const xs = [...(dg?.xai_contributors || [])].sort((a, b) => b.weight - a.weight);
  const cl = ['#16191C', '#555B61', '#8A9096', '#B5BABE'];
  return <section className="blk">
    <h3>Root-cause attribution</h3>
    <div className="lab">{dg?.probable_fault ? `${dg.probable_fault} suspected` : 'No fault detected'}</div>
    {xs.map((x, k) => <div key={x.sensor} className="xr">
      <span>{x.sensor}</span>
      <b className="num">{Math.round(x.weight * 100)}%</b>
      <div className="mt"><i style={{ width: `${x.weight * 100}%`, background: cl[k] || cl[3] }} /></div>
    </div>)}
  </section>;
}