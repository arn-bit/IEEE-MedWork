import { POSTER } from '../../poster/content';
import type { SceneProps } from '../DemoPage';

export function CompareScene({ elapsed }: SceneProps) {
  return (
    <div className="demo-compare">
      <table className="demo-compare-table">
        <caption className="visually-hidden">Verimove compared with a typical general exercise app</caption>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">Typical app</th>
            <th scope="col">Verimove</th>
          </tr>
        </thead>
        <tbody>
          {POSTER.compare.map(([what, typical, ours], i) => {
            const on = elapsed > 300 + i * 650;
            return (
              <tr key={what} style={{ opacity: on ? 1 : 0, transform: on ? 'none' : 'translateY(10px)' }}>
                <th scope="row">{what}</th>
                <td>{typical}</td>
                <td className="demo-compare-ours">{ours}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="demo-facts" style={{ opacity: elapsed > 5000 ? 1 : 0 }}>
        {POSTER.compareNote}
      </p>
    </div>
  );
}
