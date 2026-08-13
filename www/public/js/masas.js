/* ñomcraft — directorio de masas.
   Todo va en porcentaje de panadero: la harina es siempre el 100 % y el resto
   de ingredientes se expresa como porcentaje de ESE peso de harina. Por eso los
   porcentajes suman mas de 100: no son partes de un total, son proporciones
   respecto a la harina. Fijas los gramos de harina y sale la receta entera.

   ing: [{ n: nombre, p: porcentaje, liq: cuenta como hidratacion, nota }]      */

const MASA_FAMS = ['Pan', 'Pizza', 'Enriquecida', 'Hojaldrada', 'Quebrada', 'Fresca', 'Batida', 'Cultivo'];

const MASAS = [
  {
    id: 'pan-blanco', name: 'Pan blanco de cada dia', icon: 'pan', fam: 'Pan',
    hint: 'La masa base. Si solo aprendes una, que sea esta.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua', p: 65, liq: true },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 1, nota: 'o 1/3 de seca' }
    ],
    steps: [
      'Mezcla harina y agua y deja reposar 30 min (autolisis).',
      'Añade sal y levadura. Amasa hasta que la masa pase la prueba de la membrana.',
      'Fermenta en bloque 2 h con un pliegue cada 30 min.',
      'Divide, bolea y deja reposar 15 min.',
      'Forma, ponla en el banneton y fermenta 1 h más.',
      'Horno a 250 °C con vapor 15 min; baja a 210 °C y termina 25 min.'
    ],
    notes: 'Con 65 % de agua la masa se maneja sin pelearse. Sube a 70 % cuando le pierdas el miedo.'
  },
  {
    id: 'masa-madre-pan', name: 'Pan de masa madre', icon: 'pan', fam: 'Pan',
    hint: 'Fermentacion larga, sin levadura comercial.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua', p: 72, liq: true },
      { n: 'Masa madre activa', p: 20, nota: 'al 100 % de hidratación' },
      { n: 'Sal', p: 2 }
    ],
    steps: [
      'Refresca la masa madre 4-6 h antes: debe doblar y oler a yogur.',
      'Autolisis de harina y agua, 1 h.',
      'Incorpora la masa madre y, 30 min después, la sal.',
      'Fermenta en bloque 4-5 h a 24 °C con pliegues cada 45 min.',
      'Forma y fermenta en frío (4 °C) entre 12 y 18 h.',
      'Hornea directo de la nevera: 250 °C con vapor 20 min, luego 210 °C otros 25 min.'
    ],
    notes: 'La masa madre aporta harina y agua a partes iguales; ya está contada en los porcentajes.'
  },
  {
    id: 'baguette', name: 'Baguette', icon: 'pan', fam: 'Pan',
    hint: 'Poca levadura y mucho tiempo: ahi esta el sabor.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua', p: 68, liq: true },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 0.7 }
    ],
    steps: [
      'La víspera, prepara un poolish con el 30 % de la harina, igual peso de agua y una pizca de levadura.',
      'Al día siguiente mezcla el resto y amasa suave.',
      'Fermenta 1 h 30 con dos pliegues.',
      'Divide en piezas de 250 g, preforma y reposa 20 min.',
      'Forma las barras, deja levar 45 min sobre lienzo enharinado.',
      'Greña y hornea a 250 °C con mucho vapor, 20-22 min.'
    ],
    notes: 'La greña quiere una cuchilla muy inclinada, casi paralela a la barra.'
  },
  {
    id: 'chapata', name: 'Chapata', icon: 'pan', fam: 'Pan',
    hint: 'Alta hidratacion, alveolo grande, cero boleado.',
    ing: [
      { n: 'Harina de fuerza media', p: 100 },
      { n: 'Agua', p: 80, liq: true },
      { n: 'Sal', p: 2.2 },
      { n: 'Levadura fresca', p: 0.8 }
    ],
    steps: [
      'Mezcla todo salvo 10 % del agua. Amasa en el bol con las manos mojadas.',
      'Añade el agua restante poco a poco (bassinage).',
      'Fermenta 2 h con pliegues cada 30 min dentro del bol.',
      'Vuelca sobre mucha harina, corta rectángulos y no los toques más.',
      'Levado final 30 min y al horno a 250 °C con vapor, 25 min.'
    ],
    notes: 'Cuanto menos la manipules, más grande el alveolo. La masa debe dar miedo de lo pegajosa.'
  },
  {
    id: 'pan-molde', name: 'Pan de molde', icon: 'pan', fam: 'Enriquecida',
    hint: 'Miga fina y cerrada, para tostadas y sandwiches.',
    ing: [
      { n: 'Harina de fuerza', p: 100 },
      { n: 'Leche', p: 60, liq: true },
      { n: 'Mantequilla', p: 8 },
      { n: 'Azúcar', p: 5 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 2.5 }
    ],
    steps: [
      'Amasa todo menos la mantequilla hasta tener una masa lisa.',
      'Añade la mantequilla en dados y sigue amasando hasta que se integre.',
      'Fermenta 1 h 30 hasta doblar.',
      'Forma un cilindro y colócalo en el molde engrasado.',
      'Levado final hasta que asome por el borde, 1 h.',
      'Horno a 180 °C, 35 min. Con tapa si lo quieres de sección cuadrada.'
    ],
    notes: 'Desmolda en caliente o la corteza se reblandece con su propio vapor.'
  },
  {
    id: 'pan-centeno', name: 'Pan de centeno', icon: 'pan', fam: 'Pan',
    hint: 'Sin gluten que valga: se trabaja como un barro denso.',
    ing: [
      { n: 'Harina de centeno integral', p: 100 },
      { n: 'Agua', p: 78, liq: true },
      { n: 'Masa madre de centeno', p: 25 },
      { n: 'Sal', p: 2 }
    ],
    steps: [
      'Mezcla todo con una espátula: no se amasa, no hay gluten que desarrollar.',
      'Pasa la masa al molde engrasado y alisa con la mano mojada.',
      'Fermenta 2-3 h hasta que aparezcan grietas en la superficie.',
      'Horno a 240 °C 15 min, luego 180 °C durante 50 min más.',
      'Espera 24 h antes de cortarlo. No es negociable.'
    ],
    notes: 'Cortarlo caliente lo deja gomoso. La miga necesita un día para asentar.'
  },
  {
    id: 'focaccia', name: 'Focaccia', icon: 'pan', fam: 'Pan',
    hint: 'La masa mas agradecida: se hace sola en una bandeja.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua', p: 75, liq: true },
      { n: 'Aceite de oliva', p: 6 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 1 }
    ],
    steps: [
      'Mezcla sin amasar y deja fermentar 2 h con tres pliegues.',
      'Vuelca en bandeja bien aceitada y extiende con los dedos.',
      'Reposo de 45 min y vuelve a hundir los dedos hasta el fondo.',
      'Riega con aceite, salmuera y romero.',
      'Horno a 230 °C, 20-25 min hasta que el fondo esté dorado.'
    ],
    notes: 'La salmuera (agua y sal a partes iguales) es lo que hace los hoyitos brillantes.'
  },
  {
    id: 'pizza-napolitana', name: 'Pizza napolitana', icon: 'pizza', fam: 'Pizza',
    hint: 'Poquisima levadura y 24 h de nevera.',
    ing: [
      { n: 'Harina W260-300', p: 100 },
      { n: 'Agua', p: 62, liq: true },
      { n: 'Sal', p: 2.8 },
      { n: 'Levadura fresca', p: 0.2 }
    ],
    steps: [
      'Disuelve la sal en el agua, añade el 10 % de la harina y luego la levadura.',
      'Incorpora el resto de harina y amasa 10 min hasta masa lisa.',
      'Reposo en bloque 2 h a temperatura ambiente.',
      'Divide en bolas de 250 g y fermenta en frío 24 h.',
      'Saca 3 h antes. Estira a mano, sin rodillo, dejando el borde intacto.',
      'Horno lo más fuerte que dé, con piedra bien caliente, 60-90 s.'
    ],
    notes: 'Bolas de 250 g para pizzas de 28 cm. Usa el modo «por piezas» del calculador.'
  },
  {
    id: 'bagel', name: 'Bagels', icon: 'pan', fam: 'Pan',
    hint: 'Masa dura y un hervido antes del horno.',
    ing: [
      { n: 'Harina de fuerza', p: 100 },
      { n: 'Agua', p: 55, liq: true },
      { n: 'Azúcar', p: 3 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 1.5 }
    ],
    steps: [
      'Amasa hasta obtener una masa firme y poco pegajosa. Cuesta: es masa dura.',
      'Fermenta 1 h, divide en piezas de 100 g y bolea.',
      'Haz el agujero con el dedo y ensánchalo hasta 3 cm.',
      'Fermenta en frío 12 h.',
      'Hierve 45 s por cara en agua con miel o malta.',
      'Hornea a 220 °C, 20 min, con las semillas ya puestas.'
    ],
    notes: 'El hervido gelatiniza el almidón: de ahí la corteza brillante y correosa.'
  },
  {
    id: 'brioche', name: 'Brioche', icon: 'pastel', fam: 'Enriquecida',
    hint: 'Mucha mantequilla y mucho frio.',
    ing: [
      { n: 'Harina de fuerza', p: 100 },
      { n: 'Huevo', p: 50, nota: '1 huevo ≈ 55 g' },
      { n: 'Mantequilla', p: 50 },
      { n: 'Leche', p: 10, liq: true },
      { n: 'Azúcar', p: 12 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 3 }
    ],
    steps: [
      'Amasa harina, huevo, leche, azúcar, sal y levadura hasta desarrollar el gluten.',
      'Añade la mantequilla pomada en tres tandas, esperando a que se integre.',
      'Fermenta 1 h y pasa a la nevera un mínimo de 6 h: en frío se maneja.',
      'Forma en frío, coloca en el molde y deja levar 2-3 h.',
      'Pinta con huevo y hornea a 170 °C, 30 min.'
    ],
    notes: 'Si la masa se calienta por encima de 26 °C la mantequilla se separa. Para y enfría.'
  },
  {
    id: 'croissant', name: 'Croissant', icon: 'rodillo', fam: 'Hojaldrada',
    hint: 'Masa fermentada y laminada: lo mas dificil de la lista.',
    ing: [
      { n: 'Harina de fuerza', p: 100 },
      { n: 'Agua', p: 22, liq: true },
      { n: 'Leche', p: 22, liq: true },
      { n: 'Azúcar', p: 10 },
      { n: 'Mantequilla (en la masa)', p: 6 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 4 },
      { n: 'Mantequilla de laminado', p: 50, nota: 'el empaste, aparte' }
    ],
    steps: [
      'Amasa la masa base sin desarrollar en exceso y enfríala 12 h.',
      'Forma un bloque plano con la mantequilla de laminado, a 14 °C.',
      'Encierra la mantequilla y da tres pliegues sencillos, con 30 min de frío entre cada uno.',
      'Estira a 4 mm, corta triángulos y enróllalos sin apretar.',
      'Fermenta 2-3 h a 24 °C: no más, o la mantequilla se funde.',
      'Pinta con huevo y hornea a 190 °C, 18 min.'
    ],
    notes: 'Masa y mantequilla deben tener la misma textura al estirar. Si una está más dura, se rompe la lámina.'
  },
  {
    id: 'hojaldre', name: 'Hojaldre', icon: 'rodillo', fam: 'Hojaldrada',
    hint: 'Sin levadura: sube solo por el vapor entre laminas.',
    ing: [
      { n: 'Harina floja', p: 100 },
      { n: 'Agua fría', p: 50, liq: true },
      { n: 'Mantequilla (en la masa)', p: 10 },
      { n: 'Sal', p: 2 },
      { n: 'Mantequilla de empaste', p: 70, nota: 'aparte' }
    ],
    steps: [
      'Haz un amasijo con harina, agua, sal y la mantequilla fundida. Reposo en frío 1 h.',
      'Encierra la mantequilla de empaste.',
      'Da seis pliegues sencillos, descansando 30 min en frío entre cada dos.',
      'Reposo final de 2 h antes de estirar y cortar.',
      'Horno muy fuerte al principio: 220 °C 15 min, luego 190 °C.'
    ],
    notes: 'Corta siempre con cuchillo bien afilado y a plomo: si aplastas el canto, no sube.'
  },
  {
    id: 'quebrada', name: 'Masa quebrada', icon: 'rodillo', fam: 'Quebrada',
    hint: 'Para quiches y tartas saladas. Arenosa, nada elastica.',
    ing: [
      { n: 'Harina floja', p: 100 },
      { n: 'Mantequilla fría', p: 50 },
      { n: 'Agua muy fría', p: 20, liq: true },
      { n: 'Sal', p: 1.5 }
    ],
    steps: [
      'Arenar: frota la mantequilla fría con la harina hasta textura de migas.',
      'Añade el agua con la sal y junta sin amasar. En cuanto ligue, para.',
      'Aplana en disco, envuelve y enfría 1 h.',
      'Estira a 3 mm, forra el molde y vuelve a enfriar 30 min.',
      'Hornea en blanco a 180 °C con peso, 20 min.'
    ],
    notes: 'Amasar desarrolla gluten y la masa encoge en el horno. Cuanto menos la toques, mejor.'
  },
  {
    id: 'sablee', name: 'Masa sablée', icon: 'pastel', fam: 'Quebrada',
    hint: 'La version dulce, para tartaletas de fruta.',
    ing: [
      { n: 'Harina floja', p: 100 },
      { n: 'Mantequilla pomada', p: 50 },
      { n: 'Azúcar glas', p: 35 },
      { n: 'Huevo', p: 20 },
      { n: 'Sal', p: 1 }
    ],
    steps: [
      'Cremar mantequilla con azúcar glas hasta que blanquee.',
      'Añade el huevo y la sal, integra sin montar.',
      'Incorpora la harina de una vez y para en cuanto desaparezca.',
      'Enfría 2 h antes de estirar.',
      'Hornea a 165 °C, 15-18 min hasta dorado uniforme.'
    ],
    notes: 'Se estira mejor entre dos papeles de horno; se rompe con facilidad.'
  },
  {
    id: 'pasta-fresca', name: 'Pasta fresca al huevo', icon: 'huevo', fam: 'Fresca',
    hint: 'La regla clasica: un huevo por cada 100 g de harina.',
    ing: [
      { n: 'Harina de trigo duro', p: 100 },
      { n: 'Huevo', p: 55, nota: '≈ 1 huevo por 100 g de harina' },
      { n: 'Aceite de oliva', p: 2 },
      { n: 'Sal', p: 1 }
    ],
    steps: [
      'Volcán de harina, huevos en el centro, integra con el tenedor.',
      'Amasa 10 min hasta masa muy firme y lisa.',
      'Reposo envuelta 30 min: sin esto no se estira.',
      'Lamina en pasadas sucesivas, bajando el grosor poco a poco.',
      'Corta y deja secar 15 min antes de cocer 2-3 min en agua con sal.'
    ],
    notes: 'La masa debe costar de amasar. Si está blanda, añade harina antes del reposo.'
  },
  {
    id: 'empanada', name: 'Masa de empanada', icon: 'plato', fam: 'Fresca',
    hint: 'Fina, crujiente y que aguante el relleno sin romperse.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua', p: 35, liq: true },
      { n: 'Aceite de oliva', p: 25, nota: 'o manteca' },
      { n: 'Sal', p: 2 }
    ],
    steps: [
      'Usa el aceite de sofreír el relleno, ya frío: ahí está el sabor.',
      'Mezcla todo y amasa 5 min hasta masa lisa y flexible.',
      'Reposo de 30 min.',
      'Divide en dos, estira muy fina y monta con el relleno bien escurrido.',
      'Sella el borde, haz una chimenea y hornea a 190 °C, 35 min.'
    ],
    notes: 'El relleno debe entrar frío y escurrido o la base queda cruda.'
  },
  {
    id: 'choux', name: 'Masa choux', icon: 'olla', fam: 'Batida',
    hint: 'Se cuece antes de hornear. Profiteroles y eclairs.',
    ing: [
      { n: 'Harina floja', p: 100 },
      { n: 'Agua', p: 160, liq: true },
      { n: 'Huevo', p: 160 },
      { n: 'Mantequilla', p: 75 },
      { n: 'Azúcar', p: 2 },
      { n: 'Sal', p: 2 }
    ],
    steps: [
      'Hierve agua, mantequilla, sal y azúcar.',
      'Fuera del fuego echa la harina de golpe y remueve hasta formar una bola.',
      'Vuelve al fuego 2 min para secar la masa.',
      'Deja templar a 60 °C y añade el huevo poco a poco.',
      'La masa está lista cuando cae en punta de pico desde la espátula.',
      'Horno a 180 °C, 30 min. No abras la puerta o se hunden.'
    ],
    notes: 'El huevo es orientativo: para cuando la textura sea la correcta, aunque sobre.'
  },
  {
    id: 'crepes', name: 'Masa de crepes', icon: 'leche', fam: 'Batida',
    hint: 'Liquida, se bate y reposa. La mas rapida de todas.',
    ing: [
      { n: 'Harina floja', p: 100 },
      { n: 'Leche', p: 200, liq: true },
      { n: 'Huevo', p: 50 },
      { n: 'Mantequilla fundida', p: 10 },
      { n: 'Azúcar', p: 5, nota: 'quítalo si van saladas' },
      { n: 'Sal', p: 1 }
    ],
    steps: [
      'Bate huevo con leche, añade la harina tamizada y bate hasta que no queden grumos.',
      'Incorpora la mantequilla fundida.',
      'Reposo de 1 h en la nevera: la harina se hidrata y las crepes salen tiernas.',
      'Sartén bien caliente, apenas engrasada, un cucharón por crepe.',
      'Vuelta y vuelta, unos 40 s por cara.'
    ],
    notes: 'La primera crepe siempre sale mal. Es peaje, no es culpa tuya.'
  },
  {
    id: 'tortilla-trigo', name: 'Tortillas de trigo', icon: 'plato', fam: 'Fresca',
    hint: 'Sin horno: se cocinan en sarten.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Agua templada', p: 55, liq: true },
      { n: 'Manteca o aceite', p: 12 },
      { n: 'Sal', p: 2 }
    ],
    steps: [
      'Mezcla harina, sal y grasa hasta textura de migas.',
      'Añade el agua templada y amasa 5 min.',
      'Reposo de 30 min tapada.',
      'Divide en bolas de 40 g y estira muy finas.',
      'Sartén seca y muy caliente: 30 s por cara, hasta que salgan burbujas.'
    ],
    notes: 'Apílalas dentro de un paño al salir: el vapor las mantiene flexibles.'
  },
  {
    id: 'naan', name: 'Naan', icon: 'pan', fam: 'Pan',
    hint: 'El yogur la deja tierna y con burbujas.',
    ing: [
      { n: 'Harina panificable', p: 100 },
      { n: 'Yogur natural', p: 40 },
      { n: 'Agua', p: 22, liq: true },
      { n: 'Aceite', p: 5 },
      { n: 'Azúcar', p: 2 },
      { n: 'Sal', p: 2 },
      { n: 'Levadura fresca', p: 1 }
    ],
    steps: [
      'Mezcla todo y amasa 8 min hasta masa blanda.',
      'Fermenta 1 h 30 hasta doblar.',
      'Divide en piezas de 90 g y estira en óvalos de 5 mm.',
      'Sartén de hierro al rojo o plancha: 1 min por cara, hasta que se infle.',
      'Pinta con mantequilla y ajo nada más sacarla.'
    ],
    notes: 'Cuanto más caliente la sartén, más se infla. Sin miedo.'
  },
  {
    id: 'masa-madre', name: 'Masa madre (cultivo)', icon: 'harina', fam: 'Cultivo',
    hint: 'No es una masa: es el fermento que alimenta a las demas.',
    ing: [
      { n: 'Harina integral', p: 100 },
      { n: 'Agua sin cloro', p: 100, liq: true }
    ],
    steps: [
      'Día 1: mezcla harina y agua a partes iguales. Tapa sin cerrar.',
      'Días 2-4: descarta la mitad y refresca con el mismo peso de harina y agua.',
      'Día 5 en adelante: cuando doble en 4-6 h de forma constante, está lista.',
      'Guárdala en la nevera y refréscala una vez por semana.',
      'Antes de usarla, dos refrescos seguidos a temperatura ambiente.'
    ],
    notes: 'Al 100 % de hidratación aporta mitad harina y mitad agua; tenlo en cuenta al ajustar una receta.'
  }
];

/** Suma de porcentajes: cuanta masa sale por cada 100 g de harina. */
function masaTotalPct(masa) {
  return masa.ing.reduce((sum, i) => sum + i.p, 0);
}

/** Hidratacion = porcentaje de los ingredientes marcados como liquidos. */
function masaHidratacion(masa) {
  return masa.ing.filter(i => i.liq).reduce((sum, i) => sum + i.p, 0);
}
