# Albanie
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Carte circuit Albanie</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Leaflet CSS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
    <!-- Leaflet JS -->
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>

    <style>
        #map {
            width: 100%;
            height: 90vh;
        }
    </style>
</head>
<body>

<h2>Carte interactive - Circuit de 10 jours en Albanie</h2>
<div id="map"></div>

<script>
    var map = L.map('map').setView([41.3275, 19.8189], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    var points = [
        ["Tirana", 41.3275, 19.8189, `
            <b>Tirana</b><br>
            Capitale vibrante de l’Albanie.<br>
            À voir : Place Skanderbeg, musée Bunk’Art, téléphérique de Dajti.<br>
            💡 Explore le quartier de Blloku pour ses bars modernes.
        `],
        ["Theth", 42.3958, 19.7744, `
            <b>Theth</b><br>
            Village alpin isolé avec des randonnées splendides.<br>
            À voir : Cascade de Grunas, Blue Eye.<br>
            💡 Prépare de bonnes chaussures !
        `],
        ["Valbona", 42.4700, 19.8800, `
            <b>Valbona</b><br>
            Vallée spectaculaire idéale pour la randonnée.<br>
            💡 Étape emblématique du trek Theth–Valbona.
        `],
        ["Shkodra", 42.0683, 19.5126, `
            <b>Shkodra</b><br>
            Ville culturelle et historique.<br>
            À voir : Château de Rozafa, lac de Shkodra.<br>
            💡 Loue un vélo pour explorer le bord du lac.
        `],
        ["Berat", 40.7058, 19.9522, `
            <b>Berat</b><br>
            Ville UNESCO surnommée “la ville aux mille fenêtres”.<br>
            À voir : Château, musées, ruelles pavées.<br>
            💡 Vue magique au coucher du soleil.
        `],
        ["Himarë", 40.1017, 19.7447, `
            <b>Himarë</b><br>
            Station balnéaire calme sur la Riviera.<br>
            Plages : Spile, Livadhi, Jale.<br>
            💡 Idéal pour se détendre.
        `],
        ["Plage de Gjipe", 40.1426, 19.7441, `
            <b>Plage de Gjipe</b><br>
            Crique sauvage entre falaises.<br>
            💡 Prévois de l’eau et des snacks, aucun service sur place.
        `],
        ["Ksamil", 39.7683, 20.0019, `
            <b>Ksamil</b><br>
            Plages paradisiaques avec îlots accessibles à la nage.<br>
            💡 Va tôt pour éviter la foule.
        `],
        ["Butrint", 39.7458, 20.0208, `
            <b>Butrint</b><br>
            Site archéologique gréco-romain classé UNESCO.<br>
            💡 Combine avec Ksamil le même jour.
        `],
        ["Gjirokastër", 40.0758, 20.1389, `
            <b>Gjirokastër</b><br>
            Ville-musée en pierre classée UNESCO.<br>
            À voir : château, maisons traditionnelles.<br>
            💡 Meilleures photos en fin d’après-midi.
        `]
    ];

    points.forEach(function(point) {
        L.marker([point[1], point[2]]).addTo(map)
            .bindPopup(point[3])
            .bindTooltip(point[0]);
    });
</script>

</body>
</html>
