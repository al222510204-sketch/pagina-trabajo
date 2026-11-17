const empleos = [
    {
        puesto: "Auxiliar administrativo",
        empresa: "Servicios del Valle",
        tipo: "Administrativo",
        sueldo: 9500,
        lat: 19.2826,
        lng: -99.6557,
        direccion: "Centro, Toluca"
    },
    {
        puesto: "Vendedor de piso",
        empresa: "Comercial Mexiquense",
        tipo: "Ventas",
        sueldo: 8200,
        lat: 19.2890,
        lng: -99.6530,
        direccion: "Universidad, Toluca"
    },
    {
        puesto: "Técnico en soporte",
        empresa: "Soluciones TI",
        tipo: "Tecnología",
        sueldo: 13500,
        lat: 19.3002,
        lng: -99.6670,
        direccion: "Metepec"
    },
    {
        puesto: "Ayudante general",
        empresa: "Almacenes del Centro",
        tipo: "Operativo",
        sueldo: 7800,
        lat: 19.2750,
        lng: -99.6400,
        direccion: "Toluca"
    },
    {
        puesto: "Diseñador gráfico",
        empresa: "Creativa Studio",
        tipo: "Diseño",
        sueldo: 12000,
        lat: 19.2590,
        lng: -99.6200,
        direccion: "Metepec"
    }
];

let ubicacionUsuario = [19.2826, -99.6557];

const mapa = L.map('mapa').setView(ubicacionUsuario, 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(mapa);

let marcadores = L.layerGroup().addTo(mapa);
let circulo = null;
let marcadorUsuario = null;

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = grados => grados * Math.PI / 180;

    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(lat1)) *
        Math.cos(rad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function buscarUbicacion(direccion) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(direccion)}`;

    const respuesta = await fetch(url);
    const datos = await respuesta.json();

    if (!datos.length) {
        throw new Error("No se encontró la ubicación.");
    }

    return [
        Number(datos[0].lat),
        Number(datos[0].lon)
    ];
}

async function buscarEmpleos() {
    const direccion = document.getElementById("ubicacion").value.trim();
    const trabajo = document.getElementById("trabajo").value.toLowerCase().trim();
    const distancia = Number(document.getElementById("distancia").value);
    const sueldo = Number(document.getElementById("sueldo").value);

    if (!direccion) {
        alert("Escribe una ubicación.");
        return;
    }

    try {
        ubicacionUsuario = await buscarUbicacion(direccion);
        mostrarResultados(trabajo, distancia, sueldo);
    } catch (error) {
        alert(error.message);
    }
}

function mostrarResultados(trabajo, distancia, sueldo) {
    const lista = document.getElementById("listaEmpleos");
    lista.innerHTML = "";

    marcadores.clearLayers();

    if (marcadorUsuario) mapa.removeLayer(marcadorUsuario);
    if (circulo) mapa.removeLayer(circulo);

    marcadorUsuario = L.marker(ubicacionUsuario)
        .addTo(mapa)
        .bindPopup("Ubicación de búsqueda");

    circulo = L.circle(ubicacionUsuario, {
        radius: distancia * 1000,
        color: "#126b54",
        fillOpacity: 0.08
    }).addTo(mapa);

    const encontrados = empleos.filter(empleo => {
        const km = calcularDistancia(
            ubicacionUsuario[0],
            ubicacionUsuario[1],
            empleo.lat,
            empleo.lng
        );

        const coincide =
            empleo.puesto.toLowerCase().includes(trabajo) ||
            empleo.tipo.toLowerCase().includes(trabajo);

        return km <= distancia &&
            empleo.sueldo >= sueldo &&
            (!trabajo || coincide);
    });

    document.getElementById("contador").textContent =
        encontrados.length + " vacantes encontradas";

    encontrados.forEach(empleo => {
        const km = calcularDistancia(
            ubicacionUsuario[0],
            ubicacionUsuario[1],
            empleo.lat,
            empleo.lng
        );

        const tarjeta = document.createElement("div");
        tarjeta.className = "empleo";

        const titulo = document.createElement("h3");
        titulo.textContent = empleo.puesto;

        const empresa = document.createElement("p");
        empresa.textContent = "Empresa: " + empleo.empresa;

        const tipo = document.createElement("p");
        tipo.textContent = "Área: " + empleo.tipo;

        const pago = document.createElement("p");
        pago.textContent = "Sueldo: $" + empleo.sueldo.toLocaleString("es-MX") + " MXN mensuales";

        const lugar = document.createElement("p");
        lugar.textContent = "Ubicación: " + empleo.direccion;

        const kmTexto = document.createElement("p");
        kmTexto.textContent = "Distancia: " + km.toFixed(1) + " km";

        tarjeta.append(titulo, empresa, tipo, pago, lugar, kmTexto);
        lista.appendChild(tarjeta);

        L.marker([empleo.lat, empleo.lng])
            .addTo(marcadores)
            .bindPopup(
                `<b>${empleo.puesto}</b><br>${empleo.empresa}<br>$${empleo.sueldo} MXN`
            );
    });

    if (encontrados.length === 0) {
        lista.textContent = "No hay vacantes que coincidan con tus filtros.";
    }

    const puntos = [
        ubicacionUsuario,
        ...encontrados.map(e => [e.lat, e.lng])
    ];

    mapa.fitBounds(L.latLngBounds(puntos).pad(0.15), {
        maxZoom: 14
    });
}

function miUbicacion() {
    if (!navigator.geolocation) {
        alert("Tu navegador no permite obtener la ubicación.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        posicion => {
            ubicacionUsuario = [
                posicion.coords.latitude,
                posicion.coords.longitude
            ];

            document.getElementById("ubicacion").value = "Mi ubicación actual";

            const trabajo = document.getElementById("trabajo").value.toLowerCase().trim();
            const distancia = Number(document.getElementById("distancia").value);
            const sueldo = Number(document.getElementById("sueldo").value);

            mostrarResultados(trabajo, distancia, sueldo);
        },
        () => alert("No se pudo obtener tu ubicación. Revisa los permisos.")
    );
}

// Mostrar vacantes iniciales
mostrarResultados("", 10, 0);
