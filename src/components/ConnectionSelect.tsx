import { useEffect, useRef } from 'react';
import $ from 'jquery';
import select2 from 'select2';
import 'select2/dist/css/select2.css';
import type { TourNode } from '../types';

// El build CJS de select2 exporta una *factory* que hay que invocar con jQuery
// para registrar `$.fn.select2` (sus @types sólo augmentan la interfaz JQuery,
// no exportan la factory). La llamamos una vez al cargar el módulo.
(select2 as unknown as (root: unknown, jq: unknown) => void)(window, $);

// Cuántos nodos dejamos visibles por debajo del ancla al abrir la lista, para
// que se vean los nodos adyacentes al nodo actual sin tener que scrollear.
const ITEMS_BELOW_ANCHOR = 4;

interface Props {
  nodes: TourNode[];
  currentNode: TourNode;
  candidates: TourNode[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}

export default function ConnectionSelect({
  nodes,
  currentNode,
  candidates,
  value,
  onChange,
  placeholder,
}: Props) {
  const selectRef = useRef<HTMLSelectElement>(null);

  // Refs con los valores más recientes para leerlos dentro de los handlers
  // imperativos de select2 (que se registran una sola vez por init).
  const dataRef = useRef({ nodes, currentNode, candidates });
  dataRef.current = { nodes, currentNode, candidates };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Coloca el scroll de la lista de resultados de select2 para que el nodo
  // siguiente al actual (o el siguiente disponible) quede a ~ITEMS_BELOW_ANCHOR
  // posiciones del fondo. Lee siempre los datos frescos vía dataRef.
  const applyScrollOffset = () => {
    const el = selectRef.current;
    if (!el) return;
    const inst = $(el).data('select2');
    const listEl: HTMLElement | undefined = inst?.$results?.[0];
    if (!listEl) return;

    const { nodes: ns, currentNode: cur, candidates: cs } = dataRef.current;
    if (!cs.length) return;

    // Ancla = primer candidato cuyo índice global es mayor que el del nodo
    // actual; si no hay ninguno después, el último candidato.
    const indexOf = (id: string) => ns.findIndex((n) => n.id === id);
    const curIdx = indexOf(cur.id);
    let anchorIndex = cs.findIndex((c) => indexOf(c.id) > curIdx);
    if (anchorIndex < 0) anchorIndex = cs.length - 1;

    // Los <li> de resultados se renderizan en el mismo orden que los candidatos
    // (el placeholder no aparece como resultado), así que el índice del ancla en
    // `candidates` es su índice entre los <li>. Más fiable que leer datos internos
    // de select2 (que en 4.1 no usa jQuery.data para guardarlos).
    const lis = Array.from(
      listEl.querySelectorAll<HTMLElement>('li.select2-results__option'),
    );
    const anchorLi = lis[Math.min(anchorIndex, lis.length - 1)];
    if (!anchorLi) return;

    // Posición del ancla relativa a la lista (robusto ante el offsetParent).
    const liRect = anchorLi.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    const liTop = liRect.top - listRect.top + listEl.scrollTop;
    const target =
      liTop + liRect.height * (1 + ITEMS_BELOW_ANCHOR) - listEl.clientHeight;
    listEl.scrollTop = Math.max(
      0,
      Math.min(target, listEl.scrollHeight - listEl.clientHeight),
    );
  };

  // Clave que cambia cuando cambian las opciones: fuerza re-inicializar select2
  // para que relea los <option> que ha (re)renderizado React.
  const candKey = candidates.map((c) => c.id).join(',');

  // Init / destroy de select2.
  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    const $el = $(el);

    el.value = valueRef.current; // refleja el valor actual antes de inicializar
    $el.select2({
      minimumResultsForSearch: Infinity, // sin buscador
      placeholder,
      width: '100%',
    });

    $el.on('select2:select', (e) => {
      const id = (e.params?.data as { id?: string } | undefined)?.id;
      if (id) onChangeRef.current(id);
    });
    // rAF: espera al layout del popup antes de medir/ajustar el scroll.
    $el.on('select2:open', () => {
      requestAnimationFrame(applyScrollOffset);
    });

    return () => {
      $el.off('select2:select');
      $el.off('select2:open');
      if ($el.data('select2')) $el.select2('destroy');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candKey, placeholder]);

  // Refleja cambios externos de `value` (p.ej. reset a '' tras pulsar Añadir)
  // sin disparar el handler de selección (evento namespaced .select2).
  useEffect(() => {
    const el = selectRef.current;
    if (!el) return;
    if (el.value !== value) {
      $(el).val(value).trigger('change.select2');
    }
  }, [value, candKey]);

  return (
    <select ref={selectRef}>
      <option value="">{placeholder}</option>
      {candidates.map((n) => (
        <option key={n.id} value={n.id}>
          {n.name}
        </option>
      ))}
    </select>
  );
}
