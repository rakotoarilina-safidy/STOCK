# Allume le point d'acces mobile de Windows.
# Le nom du reseau Wi-Fi et son mot de passe se reglent UNE SEULE FOIS dans :
# Parametres > Reseau et Internet > Point d'acces mobile.

try {
    $ErrorActionPreference = 'Stop'

    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

    function Attendre($operation, $typeResultat) {
        $tache = $asTaskGeneric.MakeGenericMethod($typeResultat).Invoke($null, @($operation))
        $tache.Wait(-1) | Out-Null
        $tache.Result
    }

    [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime] | Out-Null
    [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null

    # Windows demande une connexion de reference : Internet si elle existe, sinon n'importe laquelle
    $profil = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
    if ($null -eq $profil) {
        $profil = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles() | Select-Object -First 1
    }
    if ($null -eq $profil) {
        throw "Aucune connexion reseau n'est active sur ce PC."
    }

    $gestionnaire = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profil)

    if ($gestionnaire.TetheringOperationalState -eq 1) {
        Write-Host "Le point d'acces est deja allume."
    } else {
        $resultat = Attendre ($gestionnaire.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
        if ($resultat.Status -eq 0) {
            Write-Host "Point d'acces allume."
        } else {
            throw "Windows a refuse d'allumer le point d'acces (code $($resultat.Status)) $($resultat.AdditionalErrorMessage)"
        }
    }
} catch {
    Write-Host ""
    Write-Host "ATTENTION : le point d'acces n'a pas pu etre allume automatiquement."
    Write-Host $_.Exception.Message
    Write-Host "Allumez-le a la main : Parametres > Reseau et Internet > Point d'acces mobile."
    Write-Host ""
}