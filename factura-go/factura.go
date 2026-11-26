// FACTURA - Calculo de IVA e ISR de una factura (Go)
// Precios con IVA incluido (12%). ISR: 5% hasta Q30,000;
// Q1,500 + 7% sobre el excedente. Total a pagar = Total - ISR.
package main

import (
	"bufio"
	"fmt"
	"math"
	"os"
	"strconv"
	"strings"
)

const (
	tasaIVA   = 0.12
	tasaISR1  = 0.05
	tasaISR2  = 0.07
	limiteISR = 30000.0
)

type producto struct {
	cantidad    int
	descripcion string
	precio      float64
	importe     float64
}

var lector = bufio.NewReader(os.Stdin)

// leerLinea muestra un mensaje y devuelve lo que escriba el usuario.
func leerLinea(mensaje string) string {
	fmt.Print(mensaje)
	texto, err := lector.ReadString('\n')
	if err != nil && texto == "" {
		return ""
	}
	return strings.TrimSpace(texto)
}

// redondear deja un numero con 2 decimales (centavos).
func redondear(x float64) float64 {
	return math.Round(x*100) / 100
}

// calcularISR: 5% hasta Q30,000; Q1,500 + 7% sobre el excedente.
func calcularISR(base float64) float64 {
	if base <= limiteISR {
		return base * tasaISR1
	}
	return limiteISR*tasaISR1 + (base-limiteISR)*tasaISR2
}

func main() {
	fmt.Println("==========================================")
	fmt.Println("   CALCULO DE IVA E ISR DE UNA FACTURA")
	fmt.Println("==========================================")

	cliente := leerLinea("Nombre del cliente: ")
	nit := leerLinea("NIT del cliente   : ")

	fmt.Println("\nIngrese los productos (cantidad 0 para terminar).")

	var productos []producto
	for {
		fmt.Printf("\nProducto #%d\n", len(productos)+1)

		entrada := leerLinea("  Cantidad        : ")
		cantidad, err := strconv.Atoi(entrada)
		if err != nil {
			if entrada == "" {
				break
			}
			fmt.Println("  ** Cantidad invalida, intente de nuevo.")
			continue
		}
		if cantidad <= 0 {
			break
		}

		descripcion := leerLinea("  Descripcion     : ")

		var precio float64
		for {
			precio, err = strconv.ParseFloat(leerLinea("  Precio unitario : "), 64)
			if err == nil && precio >= 0 {
				break
			}
			fmt.Println("  ** Precio invalido, intente de nuevo.")
		}

		productos = append(productos, producto{
			cantidad:    cantidad,
			descripcion: descripcion,
			precio:      precio,
			importe:     redondear(float64(cantidad) * precio),
		})
	}

	if len(productos) == 0 {
		fmt.Println("\nNo se ingresaron productos. Fin del programa.")
		return
	}

	// ---------------- Calculos ----------------
	var total float64
	for _, p := range productos {
		total += p.importe
	}
	total = redondear(total)
	base := redondear(total / (1 + tasaIVA))
	iva := redondear(total - base)
	isr := redondear(calcularISR(base))
	aPagar := redondear(total - isr)

	// ---------------- Reporte -----------------
	linea := strings.Repeat("-", 58)
	doble := strings.Repeat("=", 58)

	fmt.Println("\n" + doble)
	fmt.Println("                        FACTURA")
	fmt.Println(doble)
	fmt.Println("Cliente:", cliente)
	fmt.Println("NIT    :", nit)
	fmt.Println(linea)
	fmt.Printf("%5s %-30s%11s%12s\n", "CANT", "DESCRIPCION", "P.UNIT", "IMPORTE")
	fmt.Println(linea)
	for _, p := range productos {
		desc := p.descripcion
		if len(desc) > 30 {
			desc = desc[:30]
		}
		fmt.Printf("%5d %-30s%11.2f%12.2f\n", p.cantidad, desc, p.precio, p.importe)
	}
	fmt.Println(linea)
	fmt.Printf("Total factura (IVA incluido) : Q%16.2f\n", total)
	fmt.Printf("Base imponible (sin IVA)     : Q%16.2f\n", base)
	fmt.Printf("IVA 12%%                      : Q%16.2f\n", iva)
	fmt.Printf("Retencion ISR                : Q%16.2f\n", isr)
	fmt.Println(linea)
	fmt.Printf("TOTAL A PAGAR (menos ISR)    : Q%16.2f\n", aPagar)
	fmt.Println(doble)
}
