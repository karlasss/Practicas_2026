// FACTURA - Calculo de IVA e ISR de una factura (Rust)
// Precios con IVA incluido (12%). ISR: 5% hasta Q30,000;
// Q1,500 + 7% sobre el excedente. Total a pagar = Total - ISR.

use std::io::{self, Write};

const TASA_IVA: f64 = 0.12;
const TASA_ISR_1: f64 = 0.05;
const TASA_ISR_2: f64 = 0.07;
const LIMITE_ISR: f64 = 30000.0;

struct Producto {
    cantidad: u32,
    descripcion: String,
    precio: f64,
    importe: f64,
}

/// Muestra un mensaje y devuelve lo que escriba el usuario.
fn leer_linea(mensaje: &str) -> Option<String> {
    print!("{}", mensaje);
    io::stdout().flush().unwrap();
    let mut texto = String::new();
    match io::stdin().read_line(&mut texto) {
        Ok(0) | Err(_) => None,
        Ok(_) => Some(texto.trim().to_string()),
    }
}

/// Deja un numero con 2 decimales (centavos).
fn redondear(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// ISR: 5% hasta Q30,000; Q1,500 + 7% sobre el excedente.
fn calcular_isr(base: f64) -> f64 {
    if base <= LIMITE_ISR {
        base * TASA_ISR_1
    } else {
        LIMITE_ISR * TASA_ISR_1 + (base - LIMITE_ISR) * TASA_ISR_2
    }
}

fn main() {
    println!("==========================================");
    println!("   CALCULO DE IVA E ISR DE UNA FACTURA");
    println!("==========================================");

    let cliente = leer_linea("Nombre del cliente: ").unwrap_or_default();
    let nit = leer_linea("NIT del cliente   : ").unwrap_or_default();

    println!("\nIngrese los productos (cantidad 0 para terminar).");

    let mut productos: Vec<Producto> = Vec::new();
    loop {
        println!("\nProducto #{}", productos.len() + 1);

        let entrada = match leer_linea("  Cantidad        : ") {
            Some(t) => t,
            None => break,
        };
        let cantidad: u32 = match entrada.parse() {
            Ok(c) => c,
            Err(_) => {
                println!("  ** Cantidad invalida, intente de nuevo.");
                continue;
            }
        };
        if cantidad == 0 {
            break;
        }

        let descripcion = leer_linea("  Descripcion     : ").unwrap_or_default();

        let precio: f64 = loop {
            let texto = match leer_linea("  Precio unitario : ") {
                Some(t) => t,
                None => return,
            };
            match texto.parse::<f64>() {
                Ok(p) if p >= 0.0 => break p,
                _ => println!("  ** Precio invalido, intente de nuevo."),
            }
        };

        productos.push(Producto {
            cantidad,
            descripcion,
            precio,
            importe: redondear(cantidad as f64 * precio),
        });
    }

    if productos.is_empty() {
        println!("\nNo se ingresaron productos. Fin del programa.");
        return;
    }

    // ---------------- Calculos ----------------
    let total = redondear(productos.iter().map(|p| p.importe).sum());
    let base = redondear(total / (1.0 + TASA_IVA));
    let iva = redondear(total - base);
    let isr = redondear(calcular_isr(base));
    let a_pagar = redondear(total - isr);

    // ---------------- Reporte -----------------
    let linea = "-".repeat(58);
    let doble = "=".repeat(58);

    println!("\n{}", doble);
    println!("                        FACTURA");
    println!("{}", doble);
    println!("Cliente: {}", cliente);
    println!("NIT    : {}", nit);
    println!("{}", linea);
    println!("{:>5} {:<30}{:>11}{:>12}", "CANT", "DESCRIPCION", "P.UNIT", "IMPORTE");
    println!("{}", linea);
    for p in &productos {
        let desc: String = p.descripcion.chars().take(30).collect();
        println!(
            "{:>5} {:<30}{:>11.2}{:>12.2}",
            p.cantidad, desc, p.precio, p.importe
        );
    }
    println!("{}", linea);
    println!("Total factura (IVA incluido) : Q{:>16.2}", total);
    println!("Base imponible (sin IVA)     : Q{:>16.2}", base);
    println!("IVA 12%                      : Q{:>16.2}", iva);
    println!("Retencion ISR                : Q{:>16.2}", isr);
    println!("{}", linea);
    println!("TOTAL A PAGAR (menos ISR)    : Q{:>16.2}", a_pagar);
    println!("{}", doble);
}
